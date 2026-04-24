'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const cacheService = require('./cacheService');
const fileService = require('./fileService');
const {
  getFormatSelector,
  getAudioBitrate,
  formatDuration,
  getCacheKey
} = require('../utils/helpers');

// Resolve yt-dlp binary: prefer local bin/ folder, then system PATH
const LOCAL_YTDLP = path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe');
const LOCAL_FFMPEG_DIR = path.join(__dirname, '..', '..', 'bin');
const YTDLP_BIN = fs.existsSync(LOCAL_YTDLP) ? LOCAL_YTDLP : 'yt-dlp';
const FFMPEG_LOCATION = fs.existsSync(path.join(LOCAL_FFMPEG_DIR, 'ffmpeg.exe'))
  ? LOCAL_FFMPEG_DIR
  : null;

// Active download jobs map
const activeJobs = new Map();

/**
 * Run yt-dlp with given args, returns a Promise with stdout
 */
const runYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proc = spawn(YTDLP_BIN, args, { windowsHide: true });
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => chunks.push(d));
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp tidak ditemukan. Pastikan yt-dlp.exe ada di folder bin/ atau tersedia di PATH sistem.'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf8');
      if (code === 0) resolve(output);
      else reject(new Error(`yt-dlp exited with code ${code}: ${output.slice(-300)}`));
    });
  });
};

/**
 * Get video metadata from YouTube URL
 */
const getVideoInfo = async (url) => {
  const cacheKey = getCacheKey(url);
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`[Cache] HIT for ${cacheKey}`);
    return cached;
  }

  console.log(`[yt-dlp] Fetching info: ${url}`);

  let output;
  try {
    output = await runYtDlp([
      url,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
    ]);
  } catch (err) {
    throw err;
  }

  let meta;
  try {
    // Take first valid JSON line (some URLs output multiple)
    const lines = output.split('\n').filter((l) => l.trim().startsWith('{'));
    meta = JSON.parse(lines[0]);
  } catch {
    throw new Error('Gagal membaca metadata video. Pastikan URL valid dan yt-dlp terinstall.');
  }

  const videoInfo = {
    id: meta.id,
    title: meta.title || 'Unknown Title',
    duration: meta.duration || 0,
    durationFormatted: formatDuration(meta.duration),
    channel: meta.uploader || meta.channel || 'Unknown Channel',
    channelUrl: meta.uploader_url || meta.channel_url || null,
    thumbnail: meta.thumbnail || `https://img.youtube.com/vi/${meta.id}/hqdefault.jpg`,
    viewCount: meta.view_count || 0,
    uploadDate: meta.upload_date || null,
    url,
    availableFormats: extractAvailableFormats(meta.formats || [])
  };

  cacheService.set(cacheKey, videoInfo);
  return videoInfo;
};

const extractAvailableFormats = (formats) => {
  const heights = new Set(
    formats
      .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height)
      .map((f) => f.height)
  );

  const videoQualities = ['360p', '720p', '1080p'].filter((q) => {
    const h = parseInt(q);
    return heights.size === 0 || Array.from(heights).some((fh) => fh >= h);
  });

  return {
    video: videoQualities.length ? videoQualities : ['360p', '720p'],
    audio: ['128kbps', '192kbps', '320kbps']
  };
};

/**
 * Start a download job (non-blocking)
 */
const startDownload = async (url, format, quality, socketId, io, downloadDir) => {
  const jobId = uuidv4();
  const todayDir = fileService.getTodayDir(downloadDir);

  activeJobs.set(jobId, { status: 'pending', progress: 0, filename: null, error: null, url, format, quality });

  _runDownload(jobId, url, format, quality, todayDir, socketId, io).catch((err) => {
    const job = activeJobs.get(jobId);
    if (job) { job.status = 'failed'; job.error = err.message; activeJobs.set(jobId, job); }
    if (io && socketId) io.to(socketId).emit('download:error', { jobId, error: err.message });
  });

  return { jobId };
};

const _runDownload = (jobId, url, format, quality, todayDir, socketId, io) => {
  return new Promise((resolve, reject) => {
    const args = _buildArgs(url, format, quality, todayDir);
    const job = activeJobs.get(jobId);
    if (job) { job.status = 'starting'; activeJobs.set(jobId, job); }

    if (io && socketId) io.to(socketId).emit('download:start', { jobId, format, quality });
    console.log(`[Job ${jobId}] Starting: ${url} [${format}@${quality}]`);

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true });
    let lastProgress = -1;
    let outputFilename = null;

    const handleLine = (line) => {
      // Progress percent
      const pctMatch = line.match(/(\d+\.?\d*)%/);
      if (pctMatch) {
        const pct = Math.round(parseFloat(pctMatch[1]));
        if (pct !== lastProgress) {
          lastProgress = pct;
          const j = activeJobs.get(jobId);
          if (j) { j.status = 'downloading'; j.progress = pct; activeJobs.set(jobId, j); }
          if (io && socketId) io.to(socketId).emit('download:progress', { jobId, progress: pct, status: 'downloading' });
        }
      }
      // Merging/converting
      if (line.includes('Merging') || line.includes('ffmpeg') || line.includes('Converting')) {
        const j = activeJobs.get(jobId);
        if (j) { j.status = 'processing'; activeJobs.set(jobId, j); }
        if (io && socketId) io.to(socketId).emit('download:progress', { jobId, progress: 99, status: 'processing' });
      }
      // Capture destination filename
      const destMatch = line.match(/\[(?:download|ExtractAudio)\] Destination: (.+)/);
      if (destMatch) outputFilename = destMatch[1].trim();
      const mergMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
      if (mergMatch) outputFilename = mergMatch[1].trim();
    };

    let stderr = '';
    proc.stdout.on('data', (d) => d.toString().split('\n').forEach(handleLine));
    proc.stderr.on('data', (d) => { stderr += d.toString(); d.toString().split('\n').forEach(handleLine); });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp tidak ditemukan. Letakkan yt-dlp.exe di folder bin/ atau tambahkan ke PATH.'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Download gagal (kode ${code}). ${stderr.slice(-200)}`));
      }

      if (!outputFilename) outputFilename = _findNewestFile(todayDir);

      const filename = outputFilename ? path.basename(outputFilename) : null;
      const dateFolder = fileService.getTodayFolder();
      const fileUrl = filename ? `/downloads/${dateFolder}/${encodeURIComponent(filename)}` : null;

      const j = activeJobs.get(jobId);
      if (j) { j.status = 'completed'; j.progress = 100; j.filename = filename; j.fileUrl = fileUrl; activeJobs.set(jobId, j); }
      if (io && socketId) io.to(socketId).emit('download:complete', { jobId, filename, fileUrl, format, quality });

      setTimeout(() => activeJobs.delete(jobId), 30 * 60 * 1000);
      resolve({ jobId, filename, fileUrl });
    });
  });
};

const _buildArgs = (url, format, quality, outputDir) => {
  const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');
  const base = [
    url,
    '--output', outputTemplate,
    '--no-playlist',
    '--restrict-filenames',
    '--no-overwrites',
    '--progress',
    '--newline',
    '--no-warnings',
  ];

  if (FFMPEG_LOCATION) {
    base.push('--ffmpeg-location', FFMPEG_LOCATION);
  }

  if (format === 'mp3') {
    return [...base, '--extract-audio', '--audio-format', 'mp3', '--audio-quality', getAudioBitrate(quality) + 'K'];
  }

  return [...base, '--format', getFormatSelector(format, quality), '--merge-output-format', 'mp4'];
};

const _findNewestFile = (dir) => {
  try {
    const files = fs.readdirSync(dir)
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? path.join(dir, files[0].name) : null;
  } catch { return null; }
};

const getJobStatus = (jobId) => activeJobs.get(jobId) || null;
const getAllJobs = () => Array.from(activeJobs.entries()).map(([id, d]) => ({ id, ...d }));

module.exports = { getVideoInfo, startDownload, getJobStatus, getAllJobs };

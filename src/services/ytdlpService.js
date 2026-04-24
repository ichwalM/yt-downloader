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
 * Run yt-dlp with given args, returns a Promise with combined output
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
      else reject(new Error(`yt-dlp exited with code ${code}: ${output.slice(-400)}`));
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

  const output = await runYtDlp([
    url,
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
  ]);

  let meta;
  try {
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
    console.log(`[Job ${jobId.slice(0, 8)}] Start: ${url} [${format}@${quality}]`);

    const proc = spawn(YTDLP_BIN, args, { windowsHide: true });

    let lastProgress = -1;
    let finalFilePath = null;  // Captured via --print after_move:filepath
    let allOutput = '';

    // ── Handle each line of output (stdout + stderr combined) ──────────────
    const handleLine = (line) => {
      if (!line.trim()) return;
      allOutput += line + '\n';

      // 1. Capture final file path from --print after_move:filepath
      //    yt-dlp prints the absolute path of the final file to stdout
      if (line.trim().length > 3 && !line.startsWith('[') && !line.startsWith('ERROR') && !line.includes('%')) {
        const trimmed = line.trim();
        // Check if it looks like an absolute file path that exists
        if (path.isAbsolute(trimmed) && trimmed.includes(path.sep) && !finalFilePath) {
          // Will verify existence after process closes
          finalFilePath = trimmed;
          console.log(`[Job ${jobId.slice(0, 8)}] Captured path: ${trimmed}`);
        }
      }

      // 2. Also capture from [download] Destination: and [Merger] lines (fallback)
      const destMatch = line.match(/\[(?:download|ExtractAudio|MoveFiles)\] Destination:\s*(.+)/i);
      if (destMatch) {
        finalFilePath = destMatch[1].trim();
        console.log(`[Job ${jobId.slice(0, 8)}] Destination: ${finalFilePath}`);
      }
      const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
      if (mergeMatch) {
        finalFilePath = mergeMatch[1].trim();
        console.log(`[Job ${jobId.slice(0, 8)}] Merged into: ${finalFilePath}`);
      }
      // ffmpeg conversion output
      const ffDestMatch = line.match(/\[ffmpeg\] Destination:\s*(.+)/i);
      if (ffDestMatch) {
        finalFilePath = ffDestMatch[1].trim();
        console.log(`[Job ${jobId.slice(0, 8)}] FFmpeg dest: ${finalFilePath}`);
      }

      // 3. Progress tracking
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

      // 4. Merging/processing stage
      if (line.includes('Merging') || line.includes('Converting') || line.includes('[ffmpeg]')) {
        const j = activeJobs.get(jobId);
        if (j && j.status !== 'processing') {
          j.status = 'processing';
          activeJobs.set(jobId, j);
          if (io && socketId) io.to(socketId).emit('download:progress', { jobId, progress: 99, status: 'processing' });
        }
      }
    };

    proc.stdout.on('data', (d) => d.toString('utf8').split('\n').forEach(handleLine));
    proc.stderr.on('data', (d) => d.toString('utf8').split('\n').forEach(handleLine));

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp tidak ditemukan. Letakkan yt-dlp.exe di folder bin/.'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Job ${jobId.slice(0, 8)}] Failed (code ${code})`);
        return reject(new Error(`Download gagal (kode ${code}). Coba lagi atau cek koneksi internet.`));
      }

      // ── Resolve final filename ─────────────────────────────────────────────
      // 1. Verify captured path exists
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        console.log(`[Job ${jobId.slice(0, 8)}] Final file (captured): ${finalFilePath}`);
      } else {
        // 2. Fallback: scan todayDir for newest file created/modified after job start
        finalFilePath = _findNewestFileInDir(todayDir);
        console.log(`[Job ${jobId.slice(0, 8)}] Final file (scan): ${finalFilePath}`);
      }

      const filename = finalFilePath ? path.basename(finalFilePath) : null;
      const dateFolder = fileService.getTodayFolder();
      // Use encodeURIComponent only on filename, not slashes
      const fileUrl = filename ? `/downloads/${dateFolder}/${encodeURIComponent(filename)}` : null;

      console.log(`[Job ${jobId.slice(0, 8)}] Done → ${filename} | ${fileUrl}`);

      const j = activeJobs.get(jobId);
      if (j) {
        j.status = 'completed';
        j.progress = 100;
        j.filename = filename;
        j.fileUrl = fileUrl;
        activeJobs.set(jobId, j);
      }

      if (io && socketId) {
        io.to(socketId).emit('download:complete', { jobId, filename, fileUrl, format, quality });
      }

      setTimeout(() => activeJobs.delete(jobId), 30 * 60 * 1000);
      resolve({ jobId, filename, fileUrl });
    });
  });
};

/**
 * Build yt-dlp CLI arguments
 * Key: use --print after_move:filepath to reliably get the final output path
 */
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
    '--print', 'after_move:filepath',  // ← Print final file path after all processing
  ];

  if (FFMPEG_LOCATION) {
    base.push('--ffmpeg-location', FFMPEG_LOCATION);
  }

  if (format === 'mp3') {
    return [
      ...base,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', getAudioBitrate(quality) + 'K',
    ];
  }

  return [
    ...base,
    '--format', getFormatSelector(format, quality),
    '--merge-output-format', 'mp4',
  ];
};

/**
 * Find the most recently modified file in a directory
 */
const _findNewestFileInDir = (dir) => {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter((f) => !f.startsWith('.'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? path.join(dir, files[0].name) : null;
  } catch { return null; }
};

const getJobStatus = (jobId) => activeJobs.get(jobId) || null;
const getAllJobs = () => Array.from(activeJobs.entries()).map(([id, d]) => ({ id, ...d }));

module.exports = { getVideoInfo, startDownload, getJobStatus, getAllJobs };

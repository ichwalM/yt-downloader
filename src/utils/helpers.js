'use strict';

/**
 * Extract YouTube video ID from a URL
 * @param {string} url
 * @returns {string|null}
 */
const extractVideoId = (url) => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/v\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

/**
 * Generate a YouTube thumbnail URL from video ID
 * @param {string} videoId
 * @param {'maxresdefault'|'hqdefault'|'mqdefault'|'default'} quality
 * @returns {string}
 */
const getThumbnailUrl = (videoId, quality = 'hqdefault') => {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
};

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 * @param {number} seconds
 * @returns {string}
 */
const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Map quality string to yt-dlp format selector
 * @param {string} format - 'mp4' or 'mp3'
 * @param {string} quality - '360p', '720p', '1080p', '128kbps', '192kbps', '320kbps'
 * @returns {string} yt-dlp format string
 */
const getFormatSelector = (format, quality) => {
  if (format === 'mp3') {
    return 'bestaudio/best';
  }

  const heightMap = {
    '360p': 360,
    '720p': 720,
    '1080p': 1080
  };

  const height = heightMap[quality] || 720;
  // Try exact height, fall back to best quality up to height, then best available
  return `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
};

/**
 * Map quality string to audio bitrate for ffmpeg
 * @param {string} quality
 * @returns {string}
 */
const getAudioBitrate = (quality) => {
  const bitrateMap = {
    '128kbps': '128',
    '192kbps': '192',
    '320kbps': '320'
  };
  return bitrateMap[quality] || '192';
};

/**
 * Sanitize a string for use as a filename (removes illegal chars)
 * @param {string} name
 * @returns {string}
 */
const sanitizeFilename = (name) => {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\.+/g, '.')
    .trim()
    .substring(0, 200); // Limit length
};

/**
 * Generate a cache key from URL
 * @param {string} url
 * @returns {string}
 */
const getCacheKey = (url) => {
  const id = extractVideoId(url);
  return id ? `info:${id}` : `info:${url}`;
};

module.exports = {
  extractVideoId,
  getThumbnailUrl,
  formatDuration,
  getFormatSelector,
  getAudioBitrate,
  sanitizeFilename,
  getCacheKey
};

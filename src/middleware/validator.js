'use strict';

const { body, query, validationResult } = require('express-validator');

/**
 * Valid YouTube URL patterns:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 */
const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/watch\?v=[\w-]{11}(&.*)?$|^(https?:\/\/)?youtu\.be\/[\w-]{11}(\?.*)?$/;

/**
 * Sanitize and validate a YouTube URL string
 */
const sanitizeUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  // Trim whitespace
  const trimmed = url.trim();
  // Only allow safe URL characters
  const safe = trimmed.replace(/[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]/g, '');
  return safe;
};

/**
 * Check if a URL is a valid YouTube URL
 */
const isValidYouTubeUrl = (url) => {
  const sanitized = sanitizeUrl(url);
  if (!sanitized) return false;
  return YOUTUBE_REGEX.test(sanitized);
};

/**
 * Validation rules for GET /api/info
 */
const validateInfoRequest = [
  query('url')
    .notEmpty().withMessage('URL wajib diisi')
    .customSanitizer(sanitizeUrl)
    .custom((value) => {
      if (!isValidYouTubeUrl(value)) {
        throw new Error('URL YouTube tidak valid');
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Validation rules for POST /api/download
 */
const validateDownloadRequest = [
  body('url')
    .notEmpty().withMessage('URL wajib diisi')
    .customSanitizer(sanitizeUrl)
    .custom((value) => {
      if (!isValidYouTubeUrl(value)) {
        throw new Error('URL YouTube tidak valid');
      }
      return true;
    }),
  body('format')
    .notEmpty().withMessage('Format wajib dipilih')
    .isIn(['mp4', 'mp3']).withMessage('Format harus mp4 atau mp3'),
  body('quality')
    .notEmpty().withMessage('Kualitas wajib dipilih')
    .custom((value, { req }) => {
      const format = req.body.format;
      const videoQualities = ['360p', '720p', '1080p'];
      const audioQualities = ['128kbps', '192kbps', '320kbps'];
      if (format === 'mp4' && !videoQualities.includes(value)) {
        throw new Error('Kualitas video tidak valid (gunakan: 360p, 720p, 1080p)');
      }
      if (format === 'mp3' && !audioQualities.includes(value)) {
        throw new Error('Kualitas audio tidak valid (gunakan: 128kbps, 192kbps, 320kbps)');
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Validation rules for POST /api/batch-download
 */
const validateBatchDownloadRequest = [
  body('items')
    .isArray({ min: 1, max: 10 }).withMessage('Items harus berupa array dengan 1-10 item'),
  body('items.*.url')
    .notEmpty().withMessage('URL pada setiap item wajib diisi')
    .customSanitizer(sanitizeUrl)
    .custom((value) => {
      if (!isValidYouTubeUrl(value)) {
        throw new Error('URL YouTube tidak valid');
      }
      return true;
    }),
  body('items.*.format')
    .isIn(['mp4', 'mp3']).withMessage('Format harus mp4 atau mp3'),
  body('items.*.quality')
    .notEmpty().withMessage('Kualitas wajib dipilih'),
  handleValidationErrors
];

/**
 * Middleware to handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg,
      details: errors.array()
    });
  }
  next();
}

module.exports = {
  validateInfoRequest,
  validateDownloadRequest,
  validateBatchDownloadRequest,
  isValidYouTubeUrl,
  sanitizeUrl
};

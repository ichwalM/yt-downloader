'use strict';

const rateLimit = require('express-rate-limit');

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
const INFO_MAX = parseInt(process.env.INFO_RATE_LIMIT_MAX) || 30;
const DOWNLOAD_MAX = parseInt(process.env.DOWNLOAD_RATE_LIMIT_MAX) || 5;

/**
 * Rate limiter for /api/info endpoint
 * 30 requests per minute per IP
 */
const infoLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: INFO_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Terlalu banyak permintaan. Silakan tunggu sebentar.',
    retryAfter: Math.ceil(WINDOW_MS / 1000)
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  }
});

/**
 * Rate limiter for /api/download endpoint
 * 5 requests per minute per IP
 */
const downloadLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: DOWNLOAD_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Batas download tercapai. Harap tunggu sebelum mencoba lagi.',
    retryAfter: Math.ceil(WINDOW_MS / 1000)
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  }
});

module.exports = { infoLimiter, downloadLimiter };

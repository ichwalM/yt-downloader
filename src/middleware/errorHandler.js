'use strict';

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';

  // Log error
  console.error(`[Error] ${new Date().toISOString()} - ${err.message}`);
  if (isDev) console.error(err.stack);

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Build error response (never expose stack traces in production)
  const response = {
    success: false,
    error: err.message || 'Terjadi kesalahan internal server'
  };

  if (isDev && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} tidak ditemukan`
  });
};

module.exports = errorHandler;
module.exports.notFoundHandler = notFoundHandler;

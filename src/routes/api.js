'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');

const ytdlpService = require('../services/ytdlpService');
const fileService = require('../services/fileService');
const {
  validateInfoRequest,
  validateDownloadRequest,
  validateBatchDownloadRequest
} = require('../middleware/validator');

// ─── GET /api/info ─────────────────────────────────────────────────────────────
router.get('/info', validateInfoRequest, async (req, res, next) => {
  try {
    const { url } = req.query;
    const info = await ytdlpService.getVideoInfo(url);
    res.json({ success: true, data: info });
  } catch (err) {
    // Provide user-friendly error messages
    if (err.message && err.message.includes('unavailable')) {
      return res.status(404).json({ success: false, error: 'Video tidak tersedia atau telah dihapus.' });
    }
    if (err.message && (err.message.includes('private') || err.message.includes('age-restricted'))) {
      return res.status(403).json({ success: false, error: 'Video bersifat privat atau terbatas usia.' });
    }
    next(err);
  }
});

// ─── POST /api/download ────────────────────────────────────────────────────────
router.post('/download', validateDownloadRequest, async (req, res, next) => {
  try {
    const { url, format, quality, socketId } = req.body;
    const io = req.app.get('io');
    const downloadDir = req.app.get('downloadDir');

    if (!socketId) {
      return res.status(400).json({
        success: false,
        error: 'socketId diperlukan untuk tracking progress'
      });
    }

    const { jobId } = await ytdlpService.startDownload(
      url, format, quality, socketId, io, downloadDir
    );

    res.json({
      success: true,
      jobId,
      message: `Download dimulai: ${format.toUpperCase()} @ ${quality}`
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/batch-download ──────────────────────────────────────────────────
router.post('/batch-download', validateBatchDownloadRequest, async (req, res, next) => {
  try {
    const { items, socketId } = req.body;
    const io = req.app.get('io');
    const downloadDir = req.app.get('downloadDir');

    if (!socketId) {
      return res.status(400).json({
        success: false,
        error: 'socketId diperlukan untuk tracking progress'
      });
    }

    const jobs = [];
    for (const item of items) {
      const { jobId } = await ytdlpService.startDownload(
        item.url, item.format, item.quality, socketId, io, downloadDir
      );
      jobs.push({ jobId, url: item.url, format: item.format, quality: item.quality });
    }

    res.json({
      success: true,
      jobs,
      message: `${jobs.length} download dimulai`
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/status/:jobId ────────────────────────────────────────────────────
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Validate jobId format (UUID)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(jobId)) {
    return res.status(400).json({ success: false, error: 'Job ID tidak valid' });
  }

  const job = ytdlpService.getJobStatus(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job tidak ditemukan' });
  }

  res.json({ success: true, data: job });
});

// ─── GET /api/files ────────────────────────────────────────────────────────────
router.get('/files', (req, res) => {
  const downloadDir = req.app.get('downloadDir');
  const files = fileService.listFiles(downloadDir);
  res.json({ success: true, data: files });
});

// ─── DELETE /api/files ─────────────────────────────────────────────────────────
router.delete('/files/:dateFolder/:filename', (req, res) => {
  const downloadDir = req.app.get('downloadDir');
  const { dateFolder, filename } = req.params;

  // Validate date folder format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) {
    return res.status(400).json({ success: false, error: 'Format folder tanggal tidak valid' });
  }

  const deleted = fileService.deleteFile(downloadDir, dateFolder, decodeURIComponent(filename));
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'File tidak ditemukan' });
  }

  res.json({ success: true, message: 'File berhasil dihapus' });
});

// ─── GET /api/jobs ─────────────────────────────────────────────────────────────
router.get('/jobs', (req, res) => {
  const jobs = ytdlpService.getAllJobs();
  res.json({ success: true, data: jobs });
});

// ─── GET /api/health ──────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

module.exports = router;

'use strict';

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const apiRouter = require('./src/routes/api');
const { infoLimiter, downloadLimiter } = require('./src/middleware/rateLimiter');
const errorHandler = require('./src/middleware/errorHandler');
const fileService = require('./src/services/fileService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = path.join(__dirname, process.env.DOWNLOAD_DIR || 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.tailwindcss.com", "cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://i.ytimg.com", "https://img.youtube.com", "https://*.ytimg.com"],
      connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
      mediaSrc: ["'self'"],
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Static Files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Serve downloaded files (with date-organized structure)
app.use('/downloads', express.static(DOWNLOAD_DIR));

// ─── Socket.io ────────────────────────────────────────────────────────────────
// Attach io instance to app for access in routes
app.set('io', io);
app.set('downloadDir', DOWNLOAD_DIR);

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/info', infoLimiter);
app.use('/api/download', downloadLimiter);
app.use('/api', apiRouter);

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── File Cleanup Scheduler (every hour) ──────────────────────────────────────
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  fileService.cleanupOldFiles(DOWNLOAD_DIR);
}, CLEANUP_INTERVAL_MS);

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   YT-Downloader running on port ${PORT}   ║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log(`   → http://localhost:${PORT}\n`);
});

module.exports = { app, io };

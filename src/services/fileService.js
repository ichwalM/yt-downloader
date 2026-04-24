'use strict';

const fs = require('fs');
const path = require('path');

const MAX_AGE_HOURS = parseInt(process.env.MAX_FILE_AGE_HOURS) || 24;

/**
 * Get today's date folder name (YYYY-MM-DD)
 */
const getTodayFolder = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get full path for today's download folder, creating it if needed
 * @param {string} baseDir
 * @returns {string}
 */
const getTodayDir = (baseDir) => {
  const todayFolder = getTodayFolder();
  const todayDir = path.join(baseDir, todayFolder);
  if (!fs.existsSync(todayDir)) {
    fs.mkdirSync(todayDir, { recursive: true });
  }
  return todayDir;
};

/**
 * List all downloaded files, grouped by date
 * @param {string} baseDir
 * @returns {Array<{date: string, files: Array<{name, size, path, url}>}>}
 */
const listFiles = (baseDir) => {
  if (!fs.existsSync(baseDir)) return [];

  const results = [];
  const dateFolders = fs.readdirSync(baseDir).filter((f) => {
    const fullPath = path.join(baseDir, f);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(f);
  });

  // Sort newest first
  dateFolders.sort((a, b) => b.localeCompare(a));

  for (const dateFolder of dateFolders) {
    const folderPath = path.join(baseDir, dateFolder);
    const files = fs.readdirSync(folderPath)
      .filter((f) => !f.startsWith('.'))
      .map((filename) => {
        const filePath = path.join(folderPath, filename);
        const stat = fs.statSync(filePath);
        return {
          name: filename,
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          path: filePath,
          url: `/downloads/${dateFolder}/${encodeURIComponent(filename)}`,
          createdAt: stat.birthtime
        };
      });

    if (files.length > 0) {
      results.push({ date: dateFolder, files });
    }
  }

  return results;
};

/**
 * Delete a specific file
 * @param {string} baseDir
 * @param {string} dateFolder
 * @param {string} filename
 * @returns {boolean}
 */
const deleteFile = (baseDir, dateFolder, filename) => {
  // Sanitize path components to prevent path traversal
  const safeDateFolder = path.basename(dateFolder);
  const safeFilename = path.basename(filename);
  const filePath = path.join(baseDir, safeDateFolder, safeFilename);

  if (!fs.existsSync(filePath)) return false;

  fs.unlinkSync(filePath);
  return true;
};

/**
 * Auto-cleanup files older than MAX_AGE_HOURS
 * @param {string} baseDir
 */
const cleanupOldFiles = (baseDir) => {
  if (!fs.existsSync(baseDir)) return;

  const cutoffMs = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;
  let deleted = 0;

  try {
    const dateFolders = fs.readdirSync(baseDir);
    for (const dateFolder of dateFolders) {
      const folderPath = path.join(baseDir, dateFolder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const files = fs.readdirSync(folderPath);
      for (const filename of files) {
        const filePath = path.join(folderPath, filename);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoffMs) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }

      // Remove empty folders
      if (fs.readdirSync(folderPath).length === 0) {
        fs.rmdirSync(folderPath);
      }
    }

    if (deleted > 0) {
      console.log(`[Cleanup] Removed ${deleted} old file(s)`);
    }
  } catch (err) {
    console.error(`[Cleanup] Error: ${err.message}`);
  }
};

/**
 * Format bytes to human readable string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

module.exports = {
  getTodayFolder,
  getTodayDir,
  listFiles,
  deleteFile,
  cleanupOldFiles,
  formatBytes
};

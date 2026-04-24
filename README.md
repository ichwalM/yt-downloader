# YT-Downloader

Aplikasi web untuk mengunduh video YouTube sebagai **MP4** atau audio **MP3** dengan berbagai pilihan kualitas.

---

## ⚙️ Prasyarat

Sebelum menjalankan aplikasi, pastikan hal-hal berikut sudah terpasang:

### 1. Node.js
Download dari: https://nodejs.org (versi 18+ direkomendasikan)

### 2. yt-dlp
Download `yt-dlp.exe` dari:  
https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe

Simpan file ke salah satu lokasi:
- **Opsi A (Direkomendasikan)**: Buat folder `bin/` di dalam project, lalu letakkan `yt-dlp.exe` di sana.
- **Opsi B**: Tambahkan ke Windows PATH agar bisa diakses dari mana saja.

### 3. FFmpeg
Diperlukan untuk konversi audio (MP3) dan penggabungan video.

Download dari: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip

Ekstrak, lalu:
- **Opsi A**: Salin `ffmpeg.exe` dan `ffprobe.exe` dari folder `bin/` FFmpeg ke folder `bin/` project ini.
- **Opsi B**: Tambahkan folder `bin/` FFmpeg ke Windows PATH.

---

## 🚀 Instalasi & Menjalankan

```bash
# 1. Masuk ke folder project
cd yt-downloader-walz

# 2. Install dependencies
npm install

# 3. Jalankan server (development)
npm run dev

# Atau jalankan langsung:
node server.js
```

Buka browser dan akses: **http://localhost:3000**

---

## 📁 Struktur Folder

```
yt-downloader-walz/
├── server.js              # Entry point server
├── package.json
├── .env                   # Konfigurasi (port, rate limit, dll)
├── bin/                   # Letakkan yt-dlp.exe & ffmpeg.exe di sini
│   ├── yt-dlp.exe
│   ├── ffmpeg.exe
│   └── ffprobe.exe
├── downloads/             # Hasil download (terorganisir per tanggal)
│   └── YYYY-MM-DD/
├── public/                # Frontend
│   ├── index.html
│   └── js/app.js
└── src/
    ├── routes/api.js
    ├── services/
    │   ├── ytdlpService.js
    │   ├── cacheService.js
    │   └── fileService.js
    ├── middleware/
    │   ├── rateLimiter.js
    │   ├── validator.js
    │   └── errorHandler.js
    └── utils/helpers.js
```

---

## 🔧 Konfigurasi `.env`

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `MAX_FILE_AGE_HOURS` | `24` | Auto-hapus file lebih dari X jam |
| `INFO_RATE_LIMIT_MAX` | `30` | Maks. request info per menit per IP |
| `DOWNLOAD_RATE_LIMIT_MAX` | `5` | Maks. request download per menit per IP |
| `CACHE_TTL` | `300` | Cache video info (detik) |

---

## ✨ Fitur

- **Single Download** — Paste URL, pilih format & kualitas, download
- **Batch Download** — Upload hingga 10 URL sekaligus
- **Preview Info** — Thumbnail, judul, durasi, channel
- **Progress Real-time** — Progress bar via Socket.io
- **Download History** — Riwayat file terorganisir per tanggal
- **Rate Limiting** — Proteksi dari abuse
- **Auto Cleanup** — File lama otomatis dihapus

---


## ⚠️ Disclaimer

Aplikasi ini hanya untuk penggunaan pribadi dan edukasi. Pastikan Anda memiliki hak atas konten yang diunduh. Mengunduh konten yang dilindungi hak cipta tanpa izin dapat melanggar Terms of Service YouTube.

---

## 🌐 Deploy ke VPS

Untuk panduan lengkap deploy ke server VPS (Ubuntu/Debian) dengan PM2, Nginx, SSL, dan monitoring:

👉 **[docs/DEPLOY.md](./docs/DEPLOY.md)**

Mencakup:
- Setup user non-root & firewall
- Install Node.js, yt-dlp, FFmpeg di Linux
- Process management dengan PM2 (auto-restart)
- Nginx reverse proxy + WebSocket support
- SSL gratis dengan Let's Encrypt
- Cron job cleanup & auto-update yt-dlp
- Troubleshooting lengkap


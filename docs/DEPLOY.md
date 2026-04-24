# 🚀 Panduan Deploy YT-Downloader ke VPS

Panduan lengkap untuk men-deploy aplikasi YT-Downloader ke VPS Linux (Ubuntu 22.04 / Debian 12).

---

## Daftar Isi

1. [Spesifikasi VPS yang Direkomendasikan](#1-spesifikasi-vps-yang-direkomendasikan)
2. [Persiapan Awal Server](#2-persiapan-awal-server)
3. [Install Node.js](#3-install-nodejs)
4. [Install yt-dlp](#4-install-yt-dlp)
5. [Install FFmpeg](#5-install-ffmpeg)
6. [Upload & Setup Aplikasi](#6-upload--setup-aplikasi)
7. [Konfigurasi Environment](#7-konfigurasi-environment)
8. [Menjalankan dengan PM2](#8-menjalankan-dengan-pm2)
9. [Setup Nginx sebagai Reverse Proxy](#9-setup-nginx-sebagai-reverse-proxy)
10. [SSL dengan Let's Encrypt (HTTPS)](#10-ssl-dengan-lets-encrypt-https)
11. [Konfigurasi Firewall (UFW)](#11-konfigurasi-firewall-ufw)
12. [Monitoring & Maintenance](#12-monitoring--maintenance)
13. [Update Aplikasi](#13-update-aplikasi)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Spesifikasi VPS yang Direkomendasikan

| Komponen | Minimum | Direkomendasikan |
|---|---|---|
| **OS** | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 1 GB | 2 GB |
| **Storage** | 20 GB SSD | 40 GB SSD |
| **Bandwidth** | 1 TB/bulan | 2 TB/bulan |

> [!NOTE]
> Storage perlu lebih besar jika Anda menyimpan banyak file download. File hasil download disimpan di folder `downloads/` dan dibersihkan otomatis setelah 24 jam (dapat dikonfigurasi via `.env`).

Provider VPS yang direkomendasikan: **DigitalOcean**, **Vultr**, **Hetzner**, **Linode**, atau **IDCloudHost** (Indonesia).

---

## 2. Persiapan Awal Server

### 2.1 Login ke VPS via SSH

```bash
ssh root@IP_VPS_ANDA
# Contoh: ssh root@123.456.789.0
```

### 2.2 Update Sistem

```bash
apt update && apt upgrade -y
```

### 2.3 Buat User Non-Root (Keamanan)

> [!IMPORTANT]
> Jangan jalankan aplikasi sebagai `root`. Buat user khusus untuk keamanan.

```bash
# Buat user baru
adduser walz

# Tambahkan ke grup sudo
usermod -aG sudo walz

# Pindah ke user baru
su - walz
```

### 2.4 Install Paket Dasar

```bash
sudo apt install -y curl wget git unzip build-essential
```

---

## 3. Install Node.js

Gunakan **NVM (Node Version Manager)** untuk kemudahan pengelolaan versi.

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js LTS (versi 20)
nvm install 20
nvm use 20
nvm alias default 20

# Verifikasi
node --version   # Harus v20.x.x
npm --version    # Harus v10.x.x
```

---

## 4. Install yt-dlp

```bash
# Download binary terbaru ke /usr/local/bin
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp

# Beri izin eksekusi
sudo chmod a+rx /usr/local/bin/yt-dlp

# Verifikasi
yt-dlp --version
```

### Update yt-dlp (jalankan rutin setiap minggu)

```bash
sudo yt-dlp -U
```

---

## 5. Install FFmpeg

```bash
# Install dari repository resmi Ubuntu
sudo apt install -y ffmpeg

# Verifikasi
ffmpeg -version | head -1
ffprobe -version | head -1
```

---

## 6. Upload & Setup Aplikasi

### Opsi A — Clone dari Git (Direkomendasikan)

```bash
# Buat direktori aplikasi
mkdir -p /home/walz/apps
cd /home/walz/apps

# Clone repository
git clone https://github.com/USERNAME/yt-downloader-walz.git
cd yt-downloader-walz

# Install dependencies
npm install --omit=dev
```

### Opsi B — Upload Manual via SCP (dari komputer lokal)

Jalankan perintah ini di **komputer lokal** (bukan VPS):

```bash
# Compress project (kecualikan node_modules dan downloads)
cd d:\Projects\Downloader-App
tar --exclude='yt-downloader-walz/node_modules' \
    --exclude='yt-downloader-walz/downloads' \
    --exclude='yt-downloader-walz/bin' \
    -czf yt-downloader.tar.gz yt-downloader-walz

# Upload ke VPS
scp yt-downloader.tar.gz walz@IP_VPS_ANDA:/home/walz/apps/
```

Kemudian di VPS:

```bash
cd /home/walz/apps
tar -xzf yt-downloader.tar.gz
cd yt-downloader-walz
npm install --omit=dev
```

### 6.1 Buat Direktori Downloads

```bash
mkdir -p /home/walz/apps/yt-downloader-walz/downloads
chmod 755 /home/walz/apps/yt-downloader-walz/downloads
```

---

## 7. Konfigurasi Environment

```bash
cd /home/walz/apps/yt-downloader-walz

# Salin template .env
cp .env .env.production
```

Edit file `.env.production`:

```bash
nano .env.production
```

Isi dengan konfigurasi untuk production:

```env
# Server
PORT=3000
NODE_ENV=production

# File cleanup (auto-hapus file lebih dari X jam)
MAX_FILE_AGE_HOURS=12

# Rate limiting (per menit per IP)
RATE_LIMIT_WINDOW_MS=60000
INFO_RATE_LIMIT_MAX=20
DOWNLOAD_RATE_LIMIT_MAX=3

# Download directory
DOWNLOAD_DIR=downloads

# Cache TTL video info (detik)
CACHE_TTL=600
```

> [!WARNING]
> Di production, turunkan `DOWNLOAD_RATE_LIMIT_MAX` ke angka kecil (2-3) untuk mencegah abuse dan melindungi bandwidth VPS.

Simpan file: **Ctrl+O** → **Enter** → **Ctrl+X**

Kemudian salin ke `.env` yang digunakan aplikasi:

```bash
cp .env.production .env
```

---

## 8. Menjalankan dengan PM2

**PM2** adalah process manager Node.js yang memastikan aplikasi tetap berjalan setelah server reboot.

### 8.1 Install PM2

```bash
npm install -g pm2
```

### 8.2 Buat File Konfigurasi PM2

```bash
nano /home/walz/apps/yt-downloader-walz/ecosystem.config.js
```

Isi:

```js
module.exports = {
  apps: [
    {
      name: 'yt-downloader',
      script: 'server.js',
      cwd: '/home/walz/apps/yt-downloader-walz',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/home/walz/logs/yt-downloader-error.log',
      out_file: '/home/walz/logs/yt-downloader-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
```

### 8.3 Buat Direktori Logs

```bash
mkdir -p /home/walz/logs
```

### 8.4 Jalankan Aplikasi

```bash
cd /home/walz/apps/yt-downloader-walz
pm2 start ecosystem.config.js

# Lihat status
pm2 status

# Lihat log realtime
pm2 logs yt-downloader
```

### 8.5 Auto-start saat Server Reboot

```bash
# Generate startup script
pm2 startup systemd

# Ikuti instruksi yang muncul (copy-paste perintah sudo yang ditampilkan)
# Biasanya: sudo env PATH=$PATH:/home/walz/.nvm/versions/node/v20.x.x/bin pm2 startup systemd -u walz --hp /home/walz

# Simpan konfigurasi PM2 saat ini
pm2 save
```

### Perintah PM2 yang Berguna

```bash
pm2 status                    # Cek status semua proses
pm2 logs yt-downloader        # Lihat log realtime
pm2 restart yt-downloader     # Restart aplikasi
pm2 stop yt-downloader        # Stop aplikasi
pm2 reload yt-downloader      # Reload tanpa downtime (zero-downtime restart)
pm2 monit                     # Dashboard monitoring realtime
```

---

## 9. Setup Nginx sebagai Reverse Proxy

Nginx bertugas sebagai pintu masuk yang meneruskan request dari port 80/443 ke aplikasi Node.js di port 3000.

### 9.1 Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 9.2 Buat Konfigurasi Virtual Host

```bash
sudo nano /etc/nginx/sites-available/yt-downloader
```

Isi (ganti `yourdomain.com` dengan domain atau IP VPS Anda):

```nginx
upstream yt_downloader {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Limit request size (10MB max untuk body request API)
    client_max_body_size 10M;

    # Timeouts yang lebih panjang untuk download (video bisa butuh waktu lama)
    proxy_read_timeout 600s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 600s;

    # Proxy ke Node.js app
    location / {
        proxy_pass http://yt_downloader;
        proxy_http_version 1.1;

        # WebSocket support (diperlukan Socket.io)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets (JS, CSS, gambar)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://yt_downloader;
        proxy_cache_valid 200 1d;
        add_header Cache-Control "public, max-age=86400";
    }

    # Logging
    access_log /var/log/nginx/yt-downloader.access.log;
    error_log /var/log/nginx/yt-downloader.error.log;
}
```

### 9.3 Aktifkan Konfigurasi

```bash
# Buat symlink ke sites-enabled
sudo ln -s /etc/nginx/sites-available/yt-downloader /etc/nginx/sites-enabled/

# Hapus konfigurasi default (opsional)
sudo rm -f /etc/nginx/sites-enabled/default

# Test konfigurasi
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## 10. SSL dengan Let's Encrypt (HTTPS)

> [!IMPORTANT]
> SSL wajib jika menggunakan domain. Pastikan domain sudah di-pointing ke IP VPS sebelum menjalankan langkah ini.

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Dapatkan sertifikat SSL (ganti dengan domain Anda)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Ikuti petunjuk: masukkan email, setujui ToS, pilih redirect HTTP → HTTPS
```

Certbot akan **otomatis mengubah konfigurasi Nginx** untuk menggunakan HTTPS.

### Auto-renew SSL

Sertifikat Let's Encrypt berlaku 90 hari. Certbot sudah otomatis membuat cron job untuk renewal. Verifikasi:

```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Cek cron job
systemctl status certbot.timer
```

---

## 11. Konfigurasi Firewall (UFW)

```bash
# Enable UFW
sudo ufw enable

# Izinkan SSH (WAJIB sebelum enable, agar tidak terkunci)
sudo ufw allow OpenSSH

# Izinkan HTTP dan HTTPS
sudo ufw allow 'Nginx Full'

# Blokir akses langsung ke port 3000 dari luar
sudo ufw deny 3000

# Cek status
sudo ufw status verbose
```

Output yang diharapkan:

```
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
Nginx Full                 ALLOW       Anywhere
3000                       DENY        Anywhere
```

---

## 12. Monitoring & Maintenance

### 12.1 Cek Status Aplikasi

```bash
# Status PM2
pm2 status

# Log realtime
pm2 logs yt-downloader --lines 50

# Penggunaan CPU & RAM
pm2 monit
```

### 12.2 Cek Storage Downloads

```bash
# Ukuran folder downloads
du -sh /home/walz/apps/yt-downloader-walz/downloads/

# Detail per tanggal
du -sh /home/walz/apps/yt-downloader-walz/downloads/*/
```

### 12.3 Setup Cron: Bersihkan File Download Manual

File otomatis dibersihkan setiap jam oleh aplikasi (sesuai `MAX_FILE_AGE_HOURS`). Tambahkan cron sebagai backup:

```bash
crontab -e
```

Tambahkan baris berikut:

```cron
# Hapus semua file download lebih dari 1 hari, setiap hari jam 03:00
0 3 * * * find /home/walz/apps/yt-downloader-walz/downloads -type f -mtime +1 -delete 2>/dev/null

# Hapus folder tanggal yang kosong
5 3 * * * find /home/walz/apps/yt-downloader-walz/downloads -type d -empty -delete 2>/dev/null
```

### 12.4 Setup Cron: Update yt-dlp Otomatis

yt-dlp perlu diupdate rutin karena YouTube sering berubah:

```cron
# Update yt-dlp setiap Senin jam 04:00
0 4 * * 1 /usr/local/bin/yt-dlp -U >> /home/walz/logs/ytdlp-update.log 2>&1
```

### 12.5 Monitoring Nginx Logs

```bash
# Access log realtime
sudo tail -f /var/log/nginx/yt-downloader.access.log

# Error log
sudo tail -f /var/log/nginx/yt-downloader.error.log

# Filter hanya request error (4xx/5xx)
sudo grep -E ' (4|5)[0-9]{2} ' /var/log/nginx/yt-downloader.access.log | tail -20
```

---

## 13. Update Aplikasi

### Jika menggunakan Git

```bash
cd /home/walz/apps/yt-downloader-walz

# Pull update terbaru
git pull origin main

# Install/update dependencies
npm install --omit=dev

# Restart aplikasi tanpa downtime
pm2 reload yt-downloader

# Verifikasi
pm2 status
```

### Jika upload manual (SCP)

Upload file baru ke VPS, lalu:

```bash
cd /home/walz/apps/yt-downloader-walz
npm install --omit=dev
pm2 reload yt-downloader
```

---

## 14. Troubleshooting

### ❌ Aplikasi tidak bisa diakses dari browser

```bash
# 1. Cek apakah PM2 berjalan
pm2 status

# 2. Cek apakah port 3000 terbuka di server
ss -tlnp | grep 3000

# 3. Cek Nginx
sudo nginx -t
sudo systemctl status nginx

# 4. Cek firewall
sudo ufw status
```

### ❌ Error "yt-dlp: command not found"

```bash
# Verifikasi lokasi binary
which yt-dlp
ls -la /usr/local/bin/yt-dlp

# Jika tidak ada, install ulang
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### ❌ Socket.io tidak terkoneksi (WebSocket error)

Pastikan konfigurasi Nginx menyertakan header WebSocket:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Reload Nginx setelah edit:

```bash
sudo systemctl reload nginx
```

### ❌ Download gagal dengan error "Sign in to confirm"

YouTube memerlukan autentikasi untuk beberapa video. Update yt-dlp ke versi terbaru:

```bash
sudo yt-dlp -U
pm2 restart yt-downloader
```

### ❌ Storage VPS penuh

```bash
# Cek penggunaan disk
df -h

# Hapus semua file download manual
rm -rf /home/walz/apps/yt-downloader-walz/downloads/*/

# Cek file terbesar di sistem
du -sh /* 2>/dev/null | sort -rh | head -20
```

### ❌ RAM habis / aplikasi crash

```bash
# Cek penggunaan RAM
free -h
pm2 monit

# Restart aplikasi
pm2 restart yt-downloader

# Jika sering terjadi, turunkan max_memory_restart di ecosystem.config.js
# atau upgrade RAM VPS
```

### 📋 Melihat Log Error Aplikasi

```bash
# Log PM2 (error)
pm2 logs yt-downloader --err --lines 100

# Log file langsung
tail -f /home/walz/logs/yt-downloader-error.log
tail -f /home/walz/logs/yt-downloader-out.log
```

---

## Ringkasan Port & Service

| Service | Port | Akses |
|---|---|---|
| Node.js App | 3000 | Internal only (via Nginx) |
| Nginx HTTP | 80 | Public |
| Nginx HTTPS | 443 | Public |
| SSH | 22 | Admin only |

---

## Checklist Deploy

- [ ] VPS sudah disetup dengan user non-root
- [ ] Node.js v18+ terinstall
- [ ] yt-dlp terinstall di `/usr/local/bin/yt-dlp`
- [ ] FFmpeg terinstall
- [ ] Aplikasi di-upload dan `npm install` selesai
- [ ] File `.env` dikonfigurasi untuk production
- [ ] PM2 menjalankan aplikasi dan auto-start aktif
- [ ] Nginx dikonfigurasi sebagai reverse proxy dengan WebSocket support
- [ ] SSL Let's Encrypt aktif (jika pakai domain)
- [ ] UFW firewall aktif, port 3000 diblokir dari luar
- [ ] Cron cleanup dan yt-dlp update sudah di-setup
- [ ] Aplikasi dapat diakses dari browser

---

*Dokumentasi ini dibuat untuk YT-Downloader v1.0 · Terakhir diperbarui: April 2026*

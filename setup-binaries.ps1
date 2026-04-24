# setup-binaries.ps1
# Script otomatis download yt-dlp.exe dan ffmpeg untuk YT-Downloader
# Jalankan sekali saja sebelum npm run dev

$ErrorActionPreference = "Stop"
$BinDir = Join-Path $PSScriptRoot "bin"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  YT-Downloader — Setup Binaries" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Buat folder bin jika belum ada
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
    Write-Host "[+] Folder bin/ dibuat" -ForegroundColor Green
}

# ── Download yt-dlp.exe ────────────────────────────────────────────────────────
$YtDlpPath = Join-Path $BinDir "yt-dlp.exe"
if (Test-Path $YtDlpPath) {
    Write-Host "[✓] yt-dlp.exe sudah ada — melewati download" -ForegroundColor Green
} else {
    Write-Host "[~] Mengunduh yt-dlp.exe..." -ForegroundColor Yellow
    $ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    try {
        Invoke-WebRequest -Uri $ytdlpUrl -OutFile $YtDlpPath -UseBasicParsing
        Write-Host "[✓] yt-dlp.exe berhasil diunduh" -ForegroundColor Green
    } catch {
        Write-Host "[✗] Gagal mengunduh yt-dlp.exe: $_" -ForegroundColor Red
        Write-Host "    Download manual dari: $ytdlpUrl" -ForegroundColor Yellow
    }
}

# ── Download ffmpeg ────────────────────────────────────────────────────────────
$FfmpegPath  = Join-Path $BinDir "ffmpeg.exe"
$FfprobePath = Join-Path $BinDir "ffprobe.exe"

if ((Test-Path $FfmpegPath) -and (Test-Path $FfprobePath)) {
    Write-Host "[✓] ffmpeg.exe dan ffprobe.exe sudah ada — melewati download" -ForegroundColor Green
} else {
    Write-Host "[~] Mengunduh ffmpeg (essentials build)..." -ForegroundColor Yellow
    Write-Host "    Ini mungkin membutuhkan beberapa menit..." -ForegroundColor Gray

    $ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    $ZipPath   = Join-Path $BinDir "ffmpeg.zip"

    try {
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ZipPath -UseBasicParsing
        Write-Host "[~] Mengekstrak ffmpeg..." -ForegroundColor Yellow

        # Ekstrak zip
        $ExtractDir = Join-Path $BinDir "ffmpeg_extracted"
        Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

        # Cari ffmpeg.exe di dalam subfolder bin/
        $FfmpegBin = Get-ChildItem -Path $ExtractDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
        $FfprobeBin = Get-ChildItem -Path $ExtractDir -Recurse -Filter "ffprobe.exe" | Select-Object -First 1

        if ($FfmpegBin) {
            Copy-Item $FfmpegBin.FullName -Destination $FfmpegPath -Force
            Write-Host "[✓] ffmpeg.exe berhasil diekstrak" -ForegroundColor Green
        }
        if ($FfprobeBin) {
            Copy-Item $FfprobeBin.FullName -Destination $FfprobePath -Force
            Write-Host "[✓] ffprobe.exe berhasil diekstrak" -ForegroundColor Green
        }

        # Bersihkan file sementara
        Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue

    } catch {
        Write-Host "[✗] Gagal mengunduh ffmpeg: $_" -ForegroundColor Red
        Write-Host "    Download manual dari: https://www.gyan.dev/ffmpeg/builds/" -ForegroundColor Yellow
        Write-Host "    Ekstrak dan letakkan ffmpeg.exe + ffprobe.exe ke folder bin/" -ForegroundColor Yellow
    }
}

# ── Verifikasi ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "── Verifikasi ──────────────────────────────────" -ForegroundColor Cyan

if (Test-Path $YtDlpPath) {
    $ver = & $YtDlpPath --version 2>&1
    Write-Host "[✓] yt-dlp   : $ver" -ForegroundColor Green
} else {
    Write-Host "[✗] yt-dlp   : TIDAK DITEMUKAN" -ForegroundColor Red
}

if (Test-Path $FfmpegPath) {
    $fver = & $FfmpegPath -version 2>&1 | Select-Object -First 1
    Write-Host "[✓] ffmpeg   : OK ($($fver -replace 'ffmpeg version ',''))" -ForegroundColor Green
} else {
    Write-Host "[✗] ffmpeg   : TIDAK DITEMUKAN" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Setup selesai! Jalankan: npm run dev" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

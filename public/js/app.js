'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  socket: null,
  currentVideoInfo: null,
  selectedFormat: 'mp4',
  selectedQuality: '360p',
  batchFormat: 'mp4',
  batchQuality: '720p',
  activeJobs: new Map(),
  isDownloading: false
};

// YouTube URL regex — accepts watch?v=, youtu.be/, and playlist variants
const YT_REGEX = /youtube\.com\/watch\?.*v=[\w-]{11}|youtu\.be\/[\w-]{11}/;

// ─── Socket.io Setup ──────────────────────────────────────────────────────────
function initSocket() {
  state.socket = io({ transports: ['websocket', 'polling'] });

  state.socket.on('connect', () => {
    console.log('[Socket] Connected:', state.socket.id);
    setHealthStatus(true);
  });

  state.socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    setHealthStatus(false);
  });

  state.socket.on('download:start', ({ jobId }) => {
    updateJobUI(jobId, { status: 'starting', progress: 0, label: 'Memulai...' });
  });

  state.socket.on('download:progress', ({ jobId, progress, status }) => {
    const label = status === 'processing' ? 'Memproses & menggabungkan...' : `Mengunduh... ${progress}%`;
    updateJobUI(jobId, { status: status || 'downloading', progress, label });
  });

  state.socket.on('download:complete', ({ jobId, filename, fileUrl }) => {
    updateJobUI(jobId, { status: 'completed', progress: 100, label: 'Selesai!', filename, fileUrl });
    showCompleteCard(filename, fileUrl);
    showToast('Download selesai! File siap diunduh.', 'success');
    state.isDownloading = false;
    resetDownloadButton();
  });

  state.socket.on('download:error', ({ jobId, error }) => {
    updateJobUI(jobId, { status: 'failed', label: error || 'Download gagal' });
    showToast(error || 'Download gagal. Coba lagi.', 'error');
    state.isDownloading = false;
    resetDownloadButton();
    hideProgressSection();
  });
}

// ─── Health Indicator ─────────────────────────────────────────────────────────
function setHealthStatus(online) {
  const dot  = document.getElementById('health-dot');
  const text = document.getElementById('health-text');
  if (online) {
    dot.className = 'dot-online';
    text.textContent = 'ONLINE';
    text.style.color = '#2563EB';
  } else {
    dot.className = 'dot-offline';
    text.textContent = 'OFFLINE';
    text.style.color = '#333';
  }
}

// Check server health
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    setHealthStatus(data.success);
  } catch {
    setHealthStatus(false);
  }
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  ['single', 'batch'].forEach((t) => {
    const btn   = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    const isActive = t === tab;
    btn.classList.toggle('active', isActive);
    panel.style.display = isActive ? 'block' : 'none';
  });
  if (tab === 'batch') updateBatchQualityOptions();
}

// ─── URL Input Handling ───────────────────────────────────────────────────────
let debounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  checkHealth();

  const urlInput = document.getElementById('url-input');
  urlInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = urlInput.value.trim();

    if (!val) {
      hideUrlIndicator();
      disableFetchBtn();
      return;
    }

    debounceTimer = setTimeout(() => validateUrlInput(val), 400);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      const val = urlInput.value.trim();
      if (YT_REGEX.test(val)) fetchVideoInfo();
    }
  });
});

function validateUrlInput(url) {
  const indicator  = document.getElementById('url-indicator');
  const validIcon  = document.getElementById('url-valid-icon');
  const invalidIcon = document.getElementById('url-invalid-icon');
  const fetchBtn   = document.getElementById('fetch-btn');

  indicator.style.display = 'block';

  if (YT_REGEX.test(url)) {
    validIcon.style.display   = 'block';
    invalidIcon.style.display = 'none';
    fetchBtn.disabled = false;
  } else {
    validIcon.style.display   = 'none';
    invalidIcon.style.display = 'block';
    fetchBtn.disabled = true;
  }
}

function hideUrlIndicator() {
  document.getElementById('url-indicator').style.display = 'none';
}

function disableFetchBtn() {
  document.getElementById('fetch-btn').disabled = true;
}

// ─── Fetch Video Info ─────────────────────────────────────────────────────────
async function fetchVideoInfo() {
  const url = document.getElementById('url-input').value.trim();
  if (!url || !YT_REGEX.test(url)) return;

  const btn = document.getElementById('fetch-btn');
  const btnText = document.getElementById('fetch-btn-text');
  const spinner = document.getElementById('fetch-spinner');
  const errorEl = document.getElementById('url-error');

  // Show loading
  btn.disabled = true;
  btnText.textContent = 'Mengambil...';
  spinner.classList.remove('hidden');
  errorEl.classList.add('hidden');

  try {
    const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Gagal mengambil info video');
    }

    state.currentVideoInfo = data.data;
    showVideoInfoCard(data.data);
    showFormatQualitySection(data.data.availableFormats);

  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Cek Info';
    spinner.classList.add('hidden');
  }
}

function showVideoInfoCard(info) {
  document.getElementById('video-thumbnail').src = info.thumbnail;
  document.getElementById('video-thumbnail').alt = info.title;
  document.getElementById('video-title').textContent = info.title;
  document.getElementById('video-channel').textContent = info.channel;
  document.getElementById('video-duration-text').textContent = info.durationFormatted;
  document.getElementById('video-duration-badge').textContent = info.durationFormatted;
  document.getElementById('video-info-card').style.display = 'block';
}

function showFormatQualitySection(availableFormats) {
  const allVideoQualities = ['360p', '720p', '1080p'];
  allVideoQualities.forEach((q) => {
    const btn = document.querySelector(`#video-qualities [data-quality="${q}"]`);
    if (!btn) return;
    const available = availableFormats?.video?.includes(q) ?? true;
    btn.disabled = !available;
    btn.style.opacity = available ? '' : '0.2';
    btn.style.cursor  = available ? '' : 'not-allowed';
  });
  document.getElementById('format-quality-section').style.display = 'block';
}

function clearVideoInfo() {
  state.currentVideoInfo = null;
  document.getElementById('url-input').value = '';
  document.getElementById('video-info-card').style.display        = 'none';
  document.getElementById('format-quality-section').style.display = 'none';
  document.getElementById('progress-section').style.display       = 'none';
  document.getElementById('complete-card').style.display          = 'none';
  hideUrlIndicator();
  disableFetchBtn();
  document.getElementById('url-error').style.display = 'none';
}

// ─── Format & Quality Selection ───────────────────────────────────────────────
function selectFormat(fmt) {
  state.selectedFormat = fmt;

  ['mp4', 'mp3'].forEach((f) => {
    document.getElementById(`fmt-${f}`).classList.toggle('active', f === fmt);
  });

  const videoQ = document.getElementById('video-qualities');
  const audioQ = document.getElementById('audio-qualities');
  if (fmt === 'mp4') {
    videoQ.style.display = 'flex';
    audioQ.style.display = 'none';
    const firstVideoBtn = videoQ.querySelector('.qual-btn:not(:disabled)');
    if (firstVideoBtn) selectQuality(firstVideoBtn);
  } else {
    audioQ.style.display = 'flex';
    videoQ.style.display = 'none';
    const hqBtn = audioQ.querySelector('[data-quality="320kbps"]');
    if (hqBtn) selectQuality(hqBtn);
  }
}

function selectQuality(btn) {
  const parent = btn.closest('#video-qualities, #audio-qualities');
  parent.querySelectorAll('.qual-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.selectedQuality = btn.dataset.quality;
}

// ─── Single Download ──────────────────────────────────────────────────────────
async function startSingleDownload() {
  if (!state.currentVideoInfo || state.isDownloading) return;
  if (!state.socket?.connected) {
    showToast('Tidak terhubung ke server. Coba refresh halaman.', 'error');
    return;
  }

  state.isDownloading = true;

  const progressSection = document.getElementById('progress-section');
  progressSection.style.display = 'block';
  document.getElementById('complete-card').style.display = 'none';
  document.getElementById('progress-title').textContent    = state.currentVideoInfo.title;
  document.getElementById('progress-subtitle').textContent = `${state.selectedFormat.toUpperCase()} · ${state.selectedQuality}`;
  updateProgressBar(0, 'Memulai download...');

  const btn     = document.getElementById('download-btn');
  const btnText = document.getElementById('download-btn-text');
  btn.disabled = true;
  btnText.textContent = 'MENGUNDUH...';

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: state.currentVideoInfo.url,
        format: state.selectedFormat,
        quality: state.selectedQuality,
        socketId: state.socket.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Gagal memulai download');
    }

    // Store job
    state.activeJobs.set(data.jobId, {
      id: data.jobId,
      title: state.currentVideoInfo.title,
      format: state.selectedFormat,
      quality: state.selectedQuality
    });

  } catch (err) {
    showToast(err.message, 'error');
    state.isDownloading = false;
    resetDownloadButton();
    hideProgressSection();
  }
}

function updateProgressBar(progress, label) {
  const bar  = document.getElementById('progress-bar');
  const pct  = document.getElementById('progress-percentage');
  const lbl  = document.getElementById('progress-status-label');

  bar.style.width = `${progress}%`;
  if (progress >= 99) bar.classList.add('processing');
  else bar.classList.remove('processing');

  pct.textContent = `${progress}%`;
  if (lbl) lbl.textContent = label ? label.toUpperCase() : '';
}

function updateJobUI(jobId, { status, progress, label, filename, fileUrl }) {
  // Update single download UI
  if (progress !== undefined) updateProgressBar(progress, label || '');

  // Update batch queue UI if exists
  const batchItem = document.getElementById(`batch-item-${jobId}`);
  if (batchItem) {
    const batchBar = batchItem.querySelector('.batch-progress-bar');
    const batchLabel = batchItem.querySelector('.batch-status-label');
    const batchPct = batchItem.querySelector('.batch-pct');

    if (batchBar) batchBar.style.width = `${progress || 0}%`;
    if (batchPct) batchPct.textContent = `${progress || 0}%`;
    if (batchLabel) {
      if (status === 'completed') {
        batchLabel.innerHTML = `<a href="${fileUrl}" download class="underline text-ink-950 font-medium">Simpan File</a>`;
        batchItem.classList.add('opacity-70');
      } else if (status === 'failed') {
        batchLabel.textContent = label || 'Gagal';
        batchLabel.classList.add('text-red-500');
      } else {
        batchLabel.textContent = label || '';
      }
    }
  }
}

function showCompleteCard(filename, fileUrl) {
  document.getElementById('progress-section').style.display = 'none';
  const card = document.getElementById('complete-card');
  card.style.display = 'block';
  document.getElementById('complete-filename').textContent = filename || 'File siap';
  const link = document.getElementById('complete-download-link');
  link.href = fileUrl || '#';
  link.setAttribute('download', filename || '');
}

function hideProgressSection() {
  document.getElementById('progress-section').style.display = 'none';
}

function resetDownloadButton() {
  const btn     = document.getElementById('download-btn');
  const btnText = document.getElementById('download-btn-text');
  btn.disabled = false;
  btnText.textContent = 'MULAI DOWNLOAD';
}

function resetForm() {
  clearVideoInfo();
  document.getElementById('progress-section').style.display = 'none';
  document.getElementById('complete-card').style.display    = 'none';
  state.isDownloading = false;
  resetDownloadButton();
}

// ─── Batch Download ───────────────────────────────────────────────────────────
function selectBatchFormat(fmt) {
  state.batchFormat = fmt;
  ['mp4', 'mp3'].forEach((f) => {
    document.getElementById(`batch-fmt-${f}`).classList.toggle('active', f === fmt);
  });
  updateBatchQualityOptions();
}

function updateBatchQualityOptions() {
  const sel = document.getElementById('batch-quality');
  if (state.batchFormat === 'mp4') {
    sel.innerHTML = `
      <option value="720p">720p</option>
      <option value="360p">360p</option>
      <option value="1080p">1080p</option>
    `;
  } else {
    sel.innerHTML = `
      <option value="320kbps">320 kbps (HQ)</option>
      <option value="192kbps">192 kbps</option>
      <option value="128kbps">128 kbps</option>
    `;
  }
}

async function startBatchDownload() {
  const textarea = document.getElementById('batch-textarea');
  const rawLines = textarea.value.trim().split('\n').map((l) => l.trim()).filter((l) => l);

  const validUrls = rawLines.filter((url) => YT_REGEX.test(url));

  if (validUrls.length === 0) {
    showToast('Tidak ada URL YouTube yang valid ditemukan.', 'error');
    return;
  }

  if (validUrls.length > 10) {
    showToast('Maksimal 10 URL per batch.', 'error');
    return;
  }

  if (!state.socket?.connected) {
    showToast('Tidak terhubung ke server.', 'error');
    return;
  }

  const quality = document.getElementById('batch-quality').value;
  const items = validUrls.map((url) => ({
    url,
    format: state.batchFormat,
    quality
  }));

  // Clear queue display
  const queueEl = document.getElementById('batch-queue');
  queueEl.innerHTML = '';

  // Show queue items immediately
  items.forEach((item, idx) => {
    queueEl.innerHTML += `
      <div id="batch-item-placeholder-${idx}" class="bg-white border border-ink-200 rounded-xl p-4 animate-slide-up">
        <div class="flex items-start justify-between mb-2">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-mono text-ink-600 truncate">${item.url}</p>
            <p class="text-xs text-ink-400 mt-0.5">${item.format.toUpperCase()} · ${item.quality}</p>
          </div>
          <span class="text-xs text-ink-400 ml-2 flex-shrink-0">#${idx + 1}</span>
        </div>
        <div class="h-1 bg-ink-100 rounded-full overflow-hidden">
          <div class="batch-progress-bar h-full bg-ink-200 rounded-full transition-all duration-300" style="width:0%"></div>
        </div>
        <div class="flex items-center justify-between mt-2">
          <span class="batch-status-label text-xs text-ink-400">Menunggu...</span>
          <span class="batch-pct text-xs font-mono text-ink-400">0%</span>
        </div>
      </div>
    `;
  });

  const btn = document.getElementById('batch-download-btn');
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    const res = await fetch('/api/batch-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, socketId: state.socket.id })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Batch download gagal');

    // Re-map batch item IDs to job IDs
    data.jobs.forEach((job, idx) => {
      const placeholder = document.getElementById(`batch-item-placeholder-${idx}`);
      if (placeholder) placeholder.id = `batch-item-${job.jobId}`;
      state.activeJobs.set(job.jobId, job);
    });

    showToast(`${data.jobs.length} download dimulai dalam antrian.`, 'success');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 20h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Mulai Batch Download
    `;
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const id = `toast-${Date.now()}`;
  const isError = type === 'error';

  const toast = document.createElement('div');
  toast.id = id;
  toast.className = 'toast';
  toast.style.cssText = `
    background: ${isError ? '#EF4444' : '#111111'};
    border: 1px solid ${isError ? '#EF4444' : '#2563EB'};
    border-left: 3px solid ${isError ? '#B91C1C' : '#2563EB'};
    color: #F0F0F0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: .04em;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  `;
  toast.innerHTML = `
    <span style="flex:1;line-height:1.5;">${message}</span>
    <button onclick="document.getElementById('${id}').remove()" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:0;line-height:1;">×</button>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

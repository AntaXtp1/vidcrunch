/* ============================================
   VIDCRUNCH — assets/js/upload.js
   Logic halaman compress (index.html)
   Depends on: config.js, supabase CDN, api.js
   ============================================ */

/* ─────────────────────────────────────
   DOM ELEMENTS
───────────────────────────────────── */
const authGate      = document.getElementById('authGate');
const uploadSection = document.getElementById('uploadSection');
const gateLoginBtn  = document.getElementById('gateLoginBtn');
const gateRegBtn    = document.getElementById('gateRegisterBtn');

const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const browseBtn     = document.getElementById('browseBtn');
const filePreview   = document.getElementById('filePreview');
const videoPreview  = document.getElementById('videoPreview');
const previewFname  = document.getElementById('previewFilename');
const previewSize   = document.getElementById('previewSize');
const previewMeta   = document.getElementById('previewMeta');
const removeFile    = document.getElementById('removeFile');

const qualitySlider = document.getElementById('qualitySlider');
const qualityNumber = document.getElementById('qualityNumber');
const qualityBadge  = document.getElementById('qualityBadge');
const resButtons    = document.querySelectorAll('.res-btn');

const compressBtn   = document.getElementById('compressBtn');
const compressTxt   = document.getElementById('compressBtnText');

const progressCard  = document.getElementById('progressCard');
const progressLabel = document.getElementById('progressLabel');
const progressPct   = document.getElementById('progressPct');
const progressFill  = document.getElementById('progressFill');
const step1         = document.getElementById('step1');
const step2         = document.getElementById('step2');
const step3         = document.getElementById('step3');

const errorBanner   = document.getElementById('errorBanner');

const resultCard    = document.getElementById('resultCard');
const sizeBefore    = document.getElementById('sizeBefore');
const sizeAfter     = document.getElementById('sizeAfter');
const savingsChip   = document.getElementById('savingsChip');
const downloadBtn   = document.getElementById('downloadBtn');
const compressNew   = document.getElementById('compressNewBtn');

/* ─────────────────────────────────────
   STATE
───────────────────────────────────── */
let currentFile       = null;
let currentSession    = null;
let selectedResolution = '1920x1080';

/* ─────────────────────────────────────
   INIT
───────────────────────────────────── */
(async () => {
  // Init auth modal
  initAuthModal((user) => {
    // Setelah login/register berhasil, refresh state
    checkAuthState();
  });

  // Pasang tombol di auth gate
  gateLoginBtn?.addEventListener('click', () => window.openAuthModal('login'));
  gateRegBtn?.addEventListener('click',   () => window.openAuthModal('register'));

  // Subscribe ke perubahan auth
  onAuthStateChange((session) => {
    currentSession = session;
    renderNavAuth(session, {
      onLogin:  (tab) => window.openAuthModal(tab),
      onLogout: () => {
        currentSession = null;
        showAuthGate();
      },
    });
    if (session) showUploadSection();
    else showAuthGate();
  });

  // Check session awal
  await checkAuthState();
})();

async function checkAuthState() {
  currentSession = await getCurrentSession();
  renderNavAuth(currentSession, {
    onLogin:  (tab) => window.openAuthModal(tab),
    onLogout: () => {
      currentSession = null;
      showAuthGate();
    },
  });

  if (currentSession) showUploadSection();
  else showAuthGate();
}

function showAuthGate() {
  authGate.style.display     = 'block';
  uploadSection.style.display = 'none';
}

function showUploadSection() {
  authGate.style.display     = 'none';
  uploadSection.style.display = 'block';
}

/* ─────────────────────────────────────
   UPLOAD ZONE — Drag & Drop
───────────────────────────────────── */
uploadZone.addEventListener('click', () => fileInput.click());
browseBtn?.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', (e) => {
  if (!uploadZone.contains(e.relatedTarget)) {
    uploadZone.classList.remove('drag-over');
  }
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  if (!file.type.startsWith('video/')) {
    showError('File yang lo drop bukan video. Coba lagi bro.');
    return;
  }

  const maxSize = 500 * 1024 * 1024; // 500MB (batas Cloudinary free)
  if (file.size > maxSize) {
    showError('File terlalu gede (maks 500MB untuk Cloudinary free tier).');
    return;
  }

  currentFile = file;

  // Tampilkan preview
  const objectUrl = URL.createObjectURL(file);
  videoPreview.src = objectUrl;

  previewFname.textContent = file.name;
  previewSize.textContent  = formatBytes(file.size);

  // Ambil durasi video
  videoPreview.onloadedmetadata = () => {
    const dur = videoPreview.duration;
    const mins = Math.floor(dur / 60);
    const secs = Math.floor(dur % 60);
    previewMeta.textContent = `${mins}:${secs.toString().padStart(2, '0')} · ${file.type}`;
  };

  uploadZone.style.display  = 'none';
  filePreview.style.display = 'flex';

  updateCompressBtn();
  hideResult();
  hideError();
}

removeFile?.addEventListener('click', () => {
  currentFile = null;
  fileInput.value = '';
  videoPreview.src = '';
  filePreview.style.display  = 'none';
  uploadZone.style.display   = '';
  updateCompressBtn();
  hideResult();
  hideError();
});

/* ─────────────────────────────────────
   SETTINGS — Quality Slider
───────────────────────────────────── */
qualitySlider?.addEventListener('input', () => {
  const val = +qualitySlider.value;
  qualityNumber.textContent = val;

  let badge = 'Balanced';
  if (val >= 85)      badge = 'High Quality';
  else if (val >= 65) badge = 'Balanced';
  else if (val >= 40) badge = 'Compressed';
  else                badge = 'Potato 🥔';

  qualityBadge.textContent = badge;

  // Update warna angka sesuai value
  if (val >= 75) qualityNumber.style.color = 'var(--accent-light)';
  else if (val >= 45) qualityNumber.style.color = 'var(--yellow)';
  else qualityNumber.style.color = 'var(--red)';
});

/* ─────────────────────────────────────
   SETTINGS — Resolution Buttons
───────────────────────────────────── */
resButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    resButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedResolution = btn.dataset.value;
  });
});

/* ─────────────────────────────────────
   COMPRESS BUTTON
───────────────────────────────────── */
function updateCompressBtn() {
  if (compressBtn) compressBtn.disabled = !currentFile;
}

compressBtn?.addEventListener('click', async () => {
  if (!currentFile || !currentSession) return;
  await runCompress();
});

compressNew?.addEventListener('click', () => {
  hideResult();
  removeFile.click();
});

/* ─────────────────────────────────────
   MAIN COMPRESS FLOW
───────────────────────────────────── */
async function runCompress() {
  hideError();
  hideResult();

  const quality    = +qualitySlider.value;
  const resolution = selectedResolution;

  compressBtn.disabled  = true;
  compressTxt.textContent = 'Memproses...';

  try {
    // ── Step 1: Minta signature dari backend ──
    setStep(1);
    showProgress('Mendapatkan izin upload...', 5);

    const signedParams = await apiSignUpload({ quality, resolution });

    // ── Step 2: Upload langsung ke Cloudinary ──
    setStep(2);
    showProgress('Mengupload video ke Cloudinary...', 10);

    const cloudResult = await uploadToCloudinary(
      currentFile,
      signedParams,
      (pct) => {
        // Upload progress = 10% s/d 80%
        const mapped = 10 + Math.round(pct * 0.7);
        showProgress(`Mengupload video... ${pct}%`, mapped);
      }
    );

    // ── Step 3: Simpan ke database ──
    setStep(3);
    showProgress('Menyimpan ke history...', 85);

    const originalSize    = currentFile.size;
    const compressedSize  = cloudResult.eager?.[0]?.bytes ?? cloudResult.bytes;
    const compressedUrl   = cloudResult.eager?.[0]?.secure_url ?? cloudResult.secure_url;
    const publicId        = cloudResult.public_id;

    await apiSaveHistory({
      filename:         currentFile.name,
      original_size:    originalSize,
      compressed_size:  compressedSize,
      cloudinary_url:   compressedUrl,
      resolution:       resolution,
      quality:          quality,
      public_id:        publicId,
    });

    showProgress('Selesai!', 100);

    // ── Tampilkan Result ──
    setTimeout(() => {
      hideProgress();
      showResult({
        originalSize,
        compressedSize,
        compressedUrl,
        filename: currentFile.name,
      });
    }, 600);

  } catch (err) {
    hideProgress();
    showError('❌ ' + (err.message || 'Terjadi kesalahan. Coba lagi.'));
  } finally {
    compressBtn.disabled    = false;
    compressTxt.textContent = 'COMPRESS VIDEO';
  }
}

/* ─────────────────────────────────────
   UI HELPERS
───────────────────────────────────── */

function showProgress(text, pct) {
  progressCard.style.display = 'block';
  progressLabel.textContent  = text;
  progressPct.textContent    = pct + '%';
  progressFill.style.width   = pct + '%';
}

function hideProgress() {
  progressCard.style.display = 'none';
  progressFill.style.width   = '0%';
}

function setStep(active) {
  [step1, step2, step3].forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 < active)  el.classList.add('done');
    if (i + 1 === active) el.classList.add('active');
  });
}

function showError(msg) {
  errorBanner.textContent    = msg;
  errorBanner.style.display  = 'block';
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  errorBanner.style.display = 'none';
}

function showResult({ originalSize, compressedSize, compressedUrl, filename }) {
  const savings = calcSavingsPct(originalSize, compressedSize);

  sizeBefore.textContent  = formatBytes(originalSize);
  sizeAfter.textContent   = formatBytes(compressedSize);
  savingsChip.textContent = savings > 0 ? `Hemat ${savings}% 🎉` : 'Ukuran mirip — coba turunin kualitas';

  // ── Download via blob (gak redirect ke Cloudinary) ──
  downloadBtn.href = '#';
  downloadBtn.onclick = async (e) => {
    e.preventDefault();
    downloadBtn.textContent = '⏳ Menyiapkan download...';
    downloadBtn.style.pointerEvents = 'none';

    try {
      const res = await fetch(compressedUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'compressed_' + filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fallback: buka di tab baru kalau fetch gagal (CORS)
      window.open(compressedUrl, '_blank');
    } finally {
      downloadBtn.textContent = '⬇ Download Hasil';
      downloadBtn.style.pointerEvents = '';
    }
  };

  resultCard.style.display = 'block';
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult() {
  resultCard.style.display = 'none';
}

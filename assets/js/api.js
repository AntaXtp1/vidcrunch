/* ============================================
   VIDCRUNCH — assets/js/api.js
   - Supabase client init
   - Auth: login, register, logout, session
   - Backend calls: signUpload, saveHistory,
     getHistory, deleteHistory
   ============================================ */

// ─── Init Supabase Client ───
// Supabase SDK di-load via CDN (di HTML)
const supabaseClient = supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

/* ─────────────────────────────────────
   AUTH FUNCTIONS
───────────────────────────────────── */

/**
 * Ambil session user yang sedang login
 * @returns {Promise<{user, session} | null>}
 */
async function getCurrentSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

/**
 * Ambil user object saja
 * @returns {Promise<User | null>}
 */
async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

/**
 * Ambil JWT access token untuk dikirim ke backend
 * @returns {Promise<string | null>}
 */
async function getAccessToken() {
  const session = await getCurrentSession();
  return session?.access_token ?? null;
}

/**
 * Login dengan email & password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user, error}>}
 */
async function authLogin(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  return { user: data?.user ?? null, error: error?.message ?? null };
}

/**
 * Register akun baru
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user, error}>}
 */
async function authRegister(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return { user: null, error: error.message };
  // Supabase kirim email konfirmasi, tapi kita bisa langsung login
  if (data?.user?.identities?.length === 0) {
    return { user: null, error: 'Email sudah terdaftar. Coba login.' };
  }
  return { user: data?.user ?? null, error: null };
}

/**
 * Logout
 */
async function authLogout() {
  await supabaseClient.auth.signOut();
}

/**
 * Subscribe ke perubahan auth state
 * @param {function} callback - dipanggil dengan (session | null)
 */
function onAuthStateChange(callback) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

/* ─────────────────────────────────────
   BACKEND API CALLS
   Semua panggil /api/* (Vercel serverless)
   dengan Authorization header berisi JWT
───────────────────────────────────── */

/**
 * Helper: buat request ke backend dengan auth header
 */
async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const url = CONFIG.API_BASE_URL + path;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

/**
 * Minta signature dari backend untuk upload ke Cloudinary
 * API Secret tidak pernah menyentuh browser — aman.
 *
 * @param {object} params - { quality, resolution }
 * @returns {Promise<{signature, timestamp, eager, apiKey, cloudName}>}
 */
async function apiSignUpload(params) {
  return apiFetch('/api/sign-upload', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Upload video langsung ke Cloudinary menggunakan signed params.
 * File tidak melewati backend kita — langsung ke Cloudinary.
 *
 * @param {File} file
 * @param {object} signedParams - hasil dari apiSignUpload
 * @param {function} onProgress - callback(percent: number)
 * @returns {Promise<object>} - Cloudinary response
 */
function uploadToCloudinary(file, signedParams, onProgress) {
  return new Promise((resolve, reject) => {
    const { signature, timestamp, eager, apiKey, cloudName } = signedParams;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('signature', signature);
    formData.append('timestamp', timestamp);
    formData.append('eager', eager);
    formData.append('eager_async', 'false');
    formData.append('api_key', apiKey);

    const xhr = new XMLHttpRequest();
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress?.(pct);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = 'Upload ke Cloudinary gagal';
        try {
          const err = JSON.parse(xhr.responseText);
          msg = err.error?.message || msg;
        } catch (_) {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error saat upload ke Cloudinary')));

    xhr.open('POST', uploadUrl);
    xhr.send(formData);
  });
}

/**
 * Simpan record compress ke database via backend
 * @param {object} record - { filename, original_size, compressed_size, cloudinary_url, resolution, quality, public_id }
 * @returns {Promise<object>}
 */
async function apiSaveHistory(record) {
  return apiFetch('/api/history', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/**
 * Ambil history compress milik user yang login
 * @param {object} params - { limit, offset, search, sort }
 * @returns {Promise<{data: Array, total: number}>}
 */
async function apiGetHistory(params = {}) {
  const qs = new URLSearchParams({
    limit:  params.limit  || 12,
    offset: params.offset || 0,
    search: params.search || '',
    sort:   params.sort   || 'newest',
  }).toString();

  return apiFetch(`/api/history?${qs}`);
}

/**
 * Hapus satu record history
 * @param {string} id - UUID dari record
 * @returns {Promise<object>}
 */
async function apiDeleteHistory(id) {
  return apiFetch(`/api/history?id=${id}`, { method: 'DELETE' });
}

/* ─────────────────────────────────────
   NAVBAR AUTH STATE (shared)
   Dipakai di index.html dan history.html
───────────────────────────────────── */

/**
 * Update tampilan navbar sesuai state login
 * @param {object|null} session
 * @param {object} callbacks - { onLogin, onLogout }
 */
function renderNavAuth(session, { onLogin, onLogout } = {}) {
  const navAuth = document.getElementById('navAuth');
  if (!navAuth) return;

  if (session?.user) {
    const email = session.user.email || '';
    const initial = email[0]?.toUpperCase() || '?';

    navAuth.innerHTML = `
      <div class="nav-user">
        <div class="nav-avatar">${initial}</div>
        <span class="nav-email">${email}</span>
        <button class="btn-ghost btn-sm" id="navLogoutBtn">Logout</button>
      </div>
    `;
    document.getElementById('navLogoutBtn')?.addEventListener('click', async () => {
      await authLogout();
      onLogout?.();
    });
  } else {
    navAuth.innerHTML = `
      <button class="btn-ghost btn-sm" id="navLoginBtn">Login</button>
      <button class="btn-primary" id="navRegisterBtn" style="padding:8px 16px;font-size:13px;">Daftar</button>
    `;
    document.getElementById('navLoginBtn')?.addEventListener('click', () => onLogin?.('login'));
    document.getElementById('navRegisterBtn')?.addEventListener('click', () => onLogin?.('register'));
  }
}

/* ─────────────────────────────────────
   AUTH MODAL (shared)
   Dipakai di semua halaman
───────────────────────────────────── */

function initAuthModal(onSuccessCallback) {
  const overlay   = document.getElementById('modalOverlay');
  const tabLogin  = document.getElementById('tabLogin');
  const tabReg    = document.getElementById('tabRegister');
  const formLogin = document.getElementById('formLogin');
  const formReg   = document.getElementById('formRegister');
  const closeBtn  = document.getElementById('modalClose');

  if (!overlay) return;

  // Tab switching
  tabLogin?.addEventListener('click', () => switchTab('login'));
  tabReg?.addEventListener('click', () => switchTab('register'));
  closeBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Login submit
  document.getElementById('loginSubmit')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');

    if (!email || !pass) return showModalError(errEl, 'Email dan password wajib diisi.');

    const btn = document.getElementById('loginSubmit');
    btn.textContent = 'Loading...';
    btn.disabled = true;

    const { user, error } = await authLogin(email, pass);

    btn.textContent = 'Login';
    btn.disabled = false;

    if (error) return showModalError(errEl, error);

    closeModal();
    onSuccessCallback?.(user);
  });

  // Register submit
  document.getElementById('registerSubmit')?.addEventListener('click', async () => {
    const email = document.getElementById('registerEmail').value.trim();
    const pass  = document.getElementById('registerPassword').value;
    const errEl = document.getElementById('registerError');

    if (!email || !pass) return showModalError(errEl, 'Email dan password wajib diisi.');
    if (pass.length < 6) return showModalError(errEl, 'Password minimal 6 karakter.');

    const btn = document.getElementById('registerSubmit');
    btn.textContent = 'Loading...';
    btn.disabled = true;

    const { user, error } = await authRegister(email, pass);

    btn.textContent = 'Daftar Sekarang';
    btn.disabled = false;

    if (error) return showModalError(errEl, error);

    closeModal();
    onSuccessCallback?.(user);
  });

  function switchTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabReg.classList.toggle('active', !isLogin);
    formLogin.style.display  = isLogin ? 'flex' : 'none';
    formReg.style.display    = isLogin ? 'none' : 'flex';
  }

  function showModalError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  // Public API
  window.openAuthModal = (tab = 'login') => {
    switchTab(tab);
    overlay.style.display = 'flex';
  };

  window.closeAuthModal = closeModal;

  function closeModal() {
    overlay.style.display = 'none';
  }
}

/* ─────────────────────────────────────
   UTILS
───────────────────────────────────── */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcSavingsPct(original, compressed) {
  if (!original || !compressed) return 0;
  return Math.max(0, Math.round((1 - compressed / original) * 100));
}

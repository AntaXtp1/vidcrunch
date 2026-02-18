/* ============================================
   VIDCRUNCH — assets/js/history.js
   Logic halaman history (history.html)
   Depends on: config.js, supabase CDN, api.js
   ============================================ */

/* ─────────────────────────────────────
   DOM ELEMENTS
───────────────────────────────────── */
const authGuard      = document.getElementById('authGuard');
const historyContent = document.getElementById('historyContent');
const guardLoginBtn  = document.getElementById('guardLoginBtn');
const userEmailEl    = document.getElementById('userEmail');
const headerStats    = document.getElementById('headerStats');
const totalCompEl    = document.getElementById('totalCompressed');
const totalSavedEl   = document.getElementById('totalSaved');

const searchInput    = document.getElementById('searchInput');
const sortSelect     = document.getElementById('sortSelect');
const refreshBtn     = document.getElementById('refreshBtn');

const loadingState   = document.getElementById('loadingState');
const emptyState     = document.getElementById('emptyState');
const historyGrid    = document.getElementById('historyGrid');
const loadMoreWrap   = document.getElementById('loadMoreWrap');
const loadMoreBtn    = document.getElementById('loadMoreBtn');

const deleteOverlay  = document.getElementById('deleteOverlay');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

/* ─────────────────────────────────────
   STATE
───────────────────────────────────── */
let currentSession  = null;
let allItems        = [];      // semua item yang sudah diload
let filteredItems   = [];      // setelah search/sort
let displayedCount  = 0;
let pendingDeleteId = null;
const PAGE_SIZE     = 12;

/* ─────────────────────────────────────
   INIT
───────────────────────────────────── */
(async () => {
  // Init auth modal
  initAuthModal(async () => {
    await checkAuthAndLoad();
  });

  guardLoginBtn?.addEventListener('click', () => window.openAuthModal('login'));

  // Subscribe auth changes
  onAuthStateChange(async (session) => {
    currentSession = session;
    renderNavAuth(session, {
      onLogin:  (tab) => window.openAuthModal(tab),
      onLogout: () => {
        currentSession = null;
        showAuthGuard();
      },
    });
    if (session) await loadHistory();
    else showAuthGuard();
  });

  await checkAuthAndLoad();
})();

async function checkAuthAndLoad() {
  currentSession = await getCurrentSession();
  renderNavAuth(currentSession, {
    onLogin:  (tab) => window.openAuthModal(tab),
    onLogout: () => {
      currentSession = null;
      showAuthGuard();
    },
  });

  if (currentSession) {
    showHistoryContent();
    await loadHistory();
  } else {
    showAuthGuard();
  }
}

function showAuthGuard() {
  authGuard.style.display     = 'block';
  historyContent.style.display = 'none';
  headerStats.style.display   = 'none';
  userEmailEl.textContent     = '—';
}

function showHistoryContent() {
  authGuard.style.display     = 'none';
  historyContent.style.display = 'block';
  userEmailEl.textContent     = currentSession?.user?.email || '—';
}

/* ─────────────────────────────────────
   LOAD HISTORY
───────────────────────────────────── */
async function loadHistory() {
  showLoading(true);
  clearGrid();

  try {
    const { data, total } = await apiGetHistory({
      limit:  999, // ambil semua, filter di client
      offset: 0,
    });

    allItems = data || [];
    displayedCount = 0;

    applyFilterAndRender();
    updateStats(allItems);

  } catch (err) {
    showLoading(false);
    showEmptyState(`Gagal mengambil data: ${err.message}`);
  }
}

/* ─────────────────────────────────────
   FILTER & SORT
───────────────────────────────────── */
let searchTimeout = null;

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    displayedCount = 0;
    applyFilterAndRender();
  }, 300);
});

sortSelect?.addEventListener('change', () => {
  displayedCount = 0;
  applyFilterAndRender();
});

refreshBtn?.addEventListener('click', () => loadHistory());

function applyFilterAndRender() {
  const search = searchInput?.value?.toLowerCase() || '';
  const sort   = sortSelect?.value || 'newest';

  // Filter
  filteredItems = allItems.filter(item =>
    !search || item.filename?.toLowerCase().includes(search)
  );

  // Sort
  filteredItems.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'biggest-saving': {
        const savA = calcSavingsPct(a.original_size, a.compressed_size);
        const savB = calcSavingsPct(b.original_size, b.compressed_size);
        return savB - savA;
      }
      case 'biggest-file':
        return (b.original_size || 0) - (a.original_size || 0);
      case 'newest':
      default:
        return new Date(b.created_at) - new Date(a.created_at);
    }
  });

  clearGrid();
  renderNextPage();
}

/* ─────────────────────────────────────
   RENDER CARDS
───────────────────────────────────── */
function renderNextPage() {
  showLoading(false);

  if (filteredItems.length === 0) {
    showEmptyState();
    return;
  }

  emptyState.style.display = 'none';

  const toRender = filteredItems.slice(displayedCount, displayedCount + PAGE_SIZE);
  toRender.forEach((item, idx) => {
    const card = createCard(item, displayedCount + idx);
    historyGrid.appendChild(card);
  });

  displayedCount += toRender.length;

  // Tampilkan / sembunyikan "load more"
  if (displayedCount < filteredItems.length) {
    loadMoreWrap.style.display = 'block';
    loadMoreBtn.textContent    = `Tampilkan Lebih Banyak (${filteredItems.length - displayedCount} lagi)`;
  } else {
    loadMoreWrap.style.display = 'none';
  }
}

loadMoreBtn?.addEventListener('click', renderNextPage);

function createCard(item, index) {
  const savings   = calcSavingsPct(item.original_size, item.compressed_size);
  const savPct    = Math.min(savings, 100);
  const dateStr   = formatDate(item.created_at);
  const resLabel  = item.resolution === 'original' ? 'Original' : item.resolution || '—';
  const qualLabel = item.quality ? `Q${item.quality}` : '—';

  const card = document.createElement('div');
  card.className = 'history-card';
  card.style.animationDelay = `${Math.min(index * 0.05, 0.4)}s`;

  card.innerHTML = `
    <div class="card-thumb">
      <video
        class="card-thumb-video"
        src="${item.cloudinary_url || ''}"
        muted
        preload="metadata"
        onmouseover="this.play()"
        onmouseout="this.pause(); this.currentTime=0;"
      ></video>
      <div class="card-thumb-placeholder">🎬</div>
      <div class="card-thumb-overlay">
        <div class="card-thumb-actions">
          <a
            href="${item.cloudinary_url}"
            download="compressed_${item.filename}"
            target="_blank"
            class="thumb-btn thumb-btn-dl"
            onclick="event.stopPropagation()"
          >⬇ Download</a>
          <button
            class="thumb-btn thumb-btn-del"
            data-id="${item.id}"
          >🗑 Hapus</button>
        </div>
      </div>
    </div>

    <div class="card-body">
      <div class="card-filename" title="${item.filename}">${item.filename || 'Untitled'}</div>

      <div class="card-stats">
        <div class="card-stat">
          <span class="card-stat-label">Sebelum</span>
          <span class="card-stat-value">${formatBytes(item.original_size)}</span>
        </div>
        <div class="card-stat">
          <span class="card-stat-label">Sesudah</span>
          <span class="card-stat-value green">${formatBytes(item.compressed_size)}</span>
        </div>
        <div class="card-stat">
          <span class="card-stat-label">Hemat</span>
          <span class="card-stat-value green">${savings}%</span>
        </div>
      </div>

      <div class="savings-bar-wrap">
        <div class="savings-bar-top">
          <span class="savings-bar-label">Efisiensi kompresi</span>
          <span class="savings-bar-pct">${savings}%</span>
        </div>
        <div class="savings-bar-track">
          <div class="savings-bar-fill" style="width: ${savPct}%"></div>
        </div>
      </div>

      <div class="card-footer">
        <span class="card-date">${dateStr}</span>
        <div class="card-badges">
          <span class="badge-pill">${resLabel}</span>
          <span class="badge-pill accent-pill">${qualLabel}</span>
        </div>
      </div>
    </div>
  `;

  // Attach delete button event
  card.querySelector('.thumb-btn-del')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteModal(item.id);
  });

  // Video thumbnail: hide placeholder saat video ready
  const video = card.querySelector('.card-thumb-video');
  const placeholder = card.querySelector('.card-thumb-placeholder');
  video?.addEventListener('loadeddata', () => {
    placeholder.style.display = 'none';
  });

  return card;
}

/* ─────────────────────────────────────
   STATS
───────────────────────────────────── */
function updateStats(items) {
  if (!items || items.length === 0) {
    headerStats.style.display = 'none';
    return;
  }

  const totalBytes = items.reduce((sum, item) => {
    return sum + Math.max(0, (item.original_size || 0) - (item.compressed_size || 0));
  }, 0);

  totalCompEl.textContent = items.length;
  totalSavedEl.textContent = formatBytes(totalBytes);
  headerStats.style.display = 'flex';
}

/* ─────────────────────────────────────
   DELETE MODAL
───────────────────────────────────── */
function openDeleteModal(id) {
  pendingDeleteId = id;
  deleteOverlay.style.display = 'flex';
}

deleteCancelBtn?.addEventListener('click', () => {
  deleteOverlay.style.display = 'none';
  pendingDeleteId = null;
});

deleteOverlay?.addEventListener('click', (e) => {
  if (e.target === deleteOverlay) {
    deleteOverlay.style.display = 'none';
    pendingDeleteId = null;
  }
});

deleteConfirmBtn?.addEventListener('click', async () => {
  if (!pendingDeleteId) return;

  deleteConfirmBtn.textContent = 'Menghapus...';
  deleteConfirmBtn.disabled    = true;

  try {
    await apiDeleteHistory(pendingDeleteId);

    // Hapus dari local state
    allItems = allItems.filter(i => i.id !== pendingDeleteId);

    // Rerender
    displayedCount = 0;
    applyFilterAndRender();
    updateStats(allItems);

  } catch (err) {
    alert('Gagal hapus: ' + err.message);
  } finally {
    deleteConfirmBtn.textContent = 'Ya, Hapus';
    deleteConfirmBtn.disabled    = false;
    deleteOverlay.style.display  = 'none';
    pendingDeleteId              = null;
  }
});

/* ─────────────────────────────────────
   UI HELPERS
───────────────────────────────────── */
function showLoading(show) {
  loadingState.style.display = show ? 'flex' : 'none';
}

function showEmptyState(msg = null) {
  emptyState.style.display = 'block';
  if (msg) {
    emptyState.querySelector('h3').textContent = 'Oops!';
    emptyState.querySelector('p').textContent  = msg;
  } else {
    const search = searchInput?.value;
    if (search) {
      emptyState.querySelector('h3').textContent = `Gak ada hasil untuk "${search}"`;
      emptyState.querySelector('p').textContent  = 'Coba keyword lain.';
    } else {
      emptyState.querySelector('h3').textContent = 'Belum ada compress sama sekali';
      emptyState.querySelector('p').textContent  = 'Lo belum pernah compress video. Buruan lah, ngapain kesini.';
    }
  }
}

function clearGrid() {
  historyGrid.innerHTML       = '';
  emptyState.style.display    = 'none';
  loadMoreWrap.style.display  = 'none';
}

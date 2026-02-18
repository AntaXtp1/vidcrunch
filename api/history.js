/* ============================================
   VIDCRUNCH — api/history.js
   Vercel Serverless Function

   Endpoint:
   GET    /api/history?limit=12&offset=0&search=&sort=newest
          → Return history milik user yang login

   POST   /api/history
          body: { filename, original_size, compressed_size,
                  cloudinary_url, resolution, quality, public_id }
          → Simpan record baru ke database

   DELETE /api/history?id=UUID
          → Hapus record berdasarkan ID

   ENV yang dibutuhkan:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   ============================================ */

const { createClient } = require('@supabase/supabase-js');

// ─── CORS Headers ───
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Tabel Supabase ───
const TABLE = 'compress_history';

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .end();
  }

  // Set CORS untuk semua response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // ── Validasi JWT ──
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header diperlukan' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  let userId;
  let supabase;

  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      return res.status(401).json({ error: 'Token tidak valid' });
    }

    userId = user.id;

  } catch (err) {
    return res.status(500).json({ error: 'Auth check gagal: ' + err.message });
  }

  // ── Route ke handler yang sesuai ──
  try {
    switch (req.method) {
      case 'GET':    return await handleGet(req, res, supabase, userId);
      case 'POST':   return await handlePost(req, res, supabase, userId);
      case 'DELETE': return await handleDelete(req, res, supabase, userId);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error(`[history] ${req.method} error:`, err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};

/* ─────────────────────────────────────
   GET — Ambil history user
───────────────────────────────────── */
async function handleGet(req, res, supabase, userId) {
  const {
    limit  = '12',
    offset = '0',
    search = '',
    sort   = 'newest',
  } = req.query;

  const lim = Math.min(100, Math.max(1, parseInt(limit)  || 12));
  const off =               Math.max(0, parseInt(offset) || 0);

  // ── Build query ──
  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  // Search by filename
  if (search && search.trim()) {
    query = query.ilike('filename', `%${search.trim()}%`);
  }

  // Sort
  switch (sort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true });
      break;
    case 'biggest-saving':
      // Sorting by savings percentage: harus computed, fallback ke kolom savings_pct kalau ada
      // Sementara sort di DB berdasarkan selisih size
      query = query.order('created_at', { ascending: false });
      break;
    case 'biggest-file':
      query = query.order('original_size', { ascending: false });
      break;
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  // Pagination
  query = query.range(off, off + lim - 1);

  const { data, count, error } = await query;

  if (error) {
    return res.status(500).json({ error: 'Query gagal: ' + error.message });
  }

  // Sort 'biggest-saving' di aplikasi karena Supabase tidak bisa sort by computed column
  let result = data || [];
  if (sort === 'biggest-saving') {
    result = result.sort((a, b) => {
      const savA = a.original_size > 0 ? (1 - a.compressed_size / a.original_size) : 0;
      const savB = b.original_size > 0 ? (1 - b.compressed_size / b.original_size) : 0;
      return savB - savA;
    });
  }

  return res.status(200).json({
    data:  result,
    total: count || 0,
  });
}

/* ─────────────────────────────────────
   POST — Simpan record compress baru
───────────────────────────────────── */
async function handlePost(req, res, supabase, userId) {
  const {
    filename,
    original_size,
    compressed_size,
    cloudinary_url,
    resolution,
    quality,
    public_id,
  } = req.body || {};

  // Validasi field wajib
  if (!filename || !cloudinary_url) {
    return res.status(400).json({ error: 'filename dan cloudinary_url wajib diisi' });
  }

  const record = {
    user_id:          userId,
    filename:         String(filename).substring(0, 255), // batasi panjang
    original_size:    parseInt(original_size)  || 0,
    compressed_size:  parseInt(compressed_size) || 0,
    cloudinary_url:   String(cloudinary_url),
    resolution:       String(resolution || 'original'),
    quality:          parseInt(quality) || 65,
    public_id:        public_id ? String(public_id) : null,
    created_at:       new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert([record])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Gagal simpan ke database: ' + error.message });
  }

  return res.status(201).json({ data });
}

/* ─────────────────────────────────────
   DELETE — Hapus record
───────────────────────────────────── */
async function handleDelete(req, res, supabase, userId) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Parameter id diperlukan' });
  }

  // Pastikan record milik user ini (bukan user lain)
  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'Record tidak ditemukan' });
  }

  if (existing.user_id !== userId) {
    return res.status(403).json({ error: 'Lo gak berhak hapus record orang lain' });
  }

  const { error: deleteErr } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id);

  if (deleteErr) {
    return res.status(500).json({ error: 'Gagal hapus: ' + deleteErr.message });
  }

  return res.status(200).json({ success: true, deletedId: id });
}

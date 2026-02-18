/* ============================================
   VIDCRUNCH — config.js
   Public config untuk frontend.
   Isi dengan nilai dari dashboard lo.
   File ini AMAN di-commit (bukan secret key).
   ============================================ */

const CONFIG = {
  // ─── Supabase ───
  // Ambil dari: supabase.com → Project → Settings → API
  SUPABASE_URL:      'https://vfcwhmaioqgzpsicckzk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_m_2WwPh4-h4u80q1Mwzh8w_paP9n0O6',

  // ─── Cloudinary ───
  // Ambil dari: cloudinary.com → Dashboard
  CLOUDINARY_CLOUD_NAME: 'dvdzcx9ev',

  // ─── Backend API ───
  // Saat dev lokal: 'http://localhost:3000'
  // Saat di Vercel: '' (kosong = relative URL otomatis)
  API_BASE_URL: '',
};

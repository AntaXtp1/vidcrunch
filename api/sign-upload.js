/* ============================================
   VIDCRUNCH — api/sign-upload.js
   Vercel Serverless Function

   Alur:
   1. Terima request dari frontend (JWT + quality/resolution)
   2. Validasi JWT via Supabase
   3. Generate Cloudinary signature (SHA-1)
   4. Return params ke frontend untuk upload langsung
      ke Cloudinary (file tidak melewati server ini)

   ENV yang dibutuhkan:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - CLOUDINARY_CLOUD_NAME
   - CLOUDINARY_API_KEY
   - CLOUDINARY_API_SECRET
   ============================================ */

const crypto     = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ─── CORS Headers ───
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .end();
  }

  // Set CORS untuk semua response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Validasi JWT ──
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    // Cek token ke Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Token tidak valid atau sudah expired' });
    }

    // ── 2. Parse body ──
    const { quality = 65, resolution = 'original' } = req.body || {};

    // Validasi nilai
    const qualNum = Math.min(100, Math.max(1, parseInt(quality) || 65));

    // ── 3. Build Cloudinary transformation ──
    let eager = `q_${qualNum}`;

    if (resolution && resolution !== 'original') {
      const [w, h] = resolution.split('x');
      if (w && h && !isNaN(w) && !isNaN(h)) {
        // c_scale: resize proporsional, tidak crop
        eager += `,w_${w},h_${h},c_scale`;
      }
    }

    // ── 4. Generate Signature ──
    const timestamp = Math.round(Date.now() / 1000);

    // Parameter yang akan di-sign (harus diurutkan alphabetically)
    const paramsToSign = {
      eager,
      eager_async: 'false',
      timestamp: String(timestamp),
    };

    // Sort params dan gabung jadi string
    const signString = Object.keys(paramsToSign)
      .sort()
      .map(k => `${k}=${paramsToSign[k]}`)
      .join('&');

    // SHA-1 hash dari signString + API Secret
    const signature = crypto
      .createHash('sha1')
      .update(signString + process.env.CLOUDINARY_API_SECRET)
      .digest('hex');

    // ── 5. Return ke frontend ──
    return res.status(200).json({
      signature,
      timestamp,
      eager,
      apiKey:    process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    });

  } catch (err) {
    console.error('[sign-upload] Error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};

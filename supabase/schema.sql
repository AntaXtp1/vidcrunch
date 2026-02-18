-- ============================================
-- VIDCRUNCH — Supabase Database Schema
-- Jalankan query ini di:
-- Supabase Dashboard → SQL Editor → New Query
-- ============================================

-- ─── Tabel compress_history ───
CREATE TABLE IF NOT EXISTS compress_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename         VARCHAR(255) NOT NULL,
  original_size    BIGINT DEFAULT 0,      -- bytes
  compressed_size  BIGINT DEFAULT 0,      -- bytes
  cloudinary_url   TEXT NOT NULL,
  public_id        TEXT,                  -- Cloudinary public_id (untuk delete nanti)
  resolution       VARCHAR(50) DEFAULT 'original',
  quality          INTEGER DEFAULT 65,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Index untuk query yang sering ───
CREATE INDEX IF NOT EXISTS idx_history_user_id    ON compress_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON compress_history(created_at DESC);

-- ─── Row Level Security (RLS) ───
-- Aktifkan RLS supaya user hanya bisa lihat data miliknya sendiri
ALTER TABLE compress_history ENABLE ROW LEVEL SECURITY;

-- Policy: user hanya bisa SELECT data miliknya
CREATE POLICY "Users can view own history"
  ON compress_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: user hanya bisa INSERT untuk dirinya sendiri
CREATE POLICY "Users can insert own history"
  ON compress_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: user hanya bisa DELETE data miliknya
CREATE POLICY "Users can delete own history"
  ON compress_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Note ───
-- Kita pakai SERVICE_ROLE_KEY di backend (api/*.js)
-- yang bypass RLS, tapi kita tetap validasi user_id manual di kode.
-- Ini double protection — aman.

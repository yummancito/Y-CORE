-- Y-core Initial Schema
-- Run this in Supabase SQL Editor
-- All tables use service_role only; no anon/authenticated access from the client.

-- ============================================
-- Profiles (mirror of auth.users for FK references)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: Do NOT create a handle_new_user trigger on auth.users.
-- Supabase has its own internal trigger for user creation.
-- Adding a custom trigger causes "Database error saving new user" on signup.
-- Profiles are created by the API on register/login.

-- ============================================
-- Refresh tokens (managed by Y-Core API)
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================
-- Games (catalog)
-- ============================================
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  header_image_url TEXT,
  library_image_url TEXT,
  developer TEXT,
  publisher TEXT,
  release_date DATE,
  nsfw BOOLEAN DEFAULT false,
  lua_path TEXT NOT NULL,
  is_available BOOLEAN DEFAULT true,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id),
  download_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'y-core' CHECK (source IN ('y-core', 'depotbox')),
  depotbox_imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_app_id ON games(app_id);
CREATE INDEX IF NOT EXISTS idx_games_name ON games USING gin (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_games_download_count ON games(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_games_play_count ON games(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_games_uploaded_at ON games(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_is_available ON games(is_available);
CREATE INDEX IF NOT EXISTS idx_games_source ON games(source);

-- ============================================
-- Manifests (source of truth for manifest metadata)
-- ============================================
CREATE TABLE IF NOT EXISTS manifests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES games(app_id) ON DELETE CASCADE,
  depot_id TEXT NOT NULL,
  manifest_gid TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(app_id, depot_id, manifest_gid)
);

CREATE INDEX IF NOT EXISTS idx_manifests_app_id ON manifests(app_id);
CREATE INDEX IF NOT EXISTS idx_manifests_depot_id ON manifests(depot_id);

-- ============================================
-- Depot keys (decryption keys, service_role only)
-- ============================================
CREATE TABLE IF NOT EXISTS game_depot_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES games(app_id) ON DELETE CASCADE,
  depot_id TEXT NOT NULL,
  decryption_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(app_id, depot_id)
);

CREATE INDEX IF NOT EXISTS idx_depot_keys_app_id ON game_depot_keys(app_id);

-- ============================================
-- Import jobs (Depotbox import queue)
-- ============================================
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  result JSONB,
  started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON import_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_app_id ON import_jobs(app_id);
CREATE INDEX IF NOT EXISTS idx_jobs_stale ON import_jobs(status, heartbeat_at);

-- ============================================
-- Install requests (rate limiting logs)
-- ============================================
CREATE TABLE IF NOT EXISTS install_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('y-core', 'depotbox')),
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_install_requests_user ON install_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_install_requests_ip ON install_requests(ip_address, created_at);

-- ============================================
-- Game categories
-- ============================================
CREATE TABLE IF NOT EXISTS game_categories (
  app_id TEXT PRIMARY KEY REFERENCES games(app_id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_categories_category ON game_categories(category);

-- ============================================
-- RPC: increment download count
-- ============================================
CREATE OR REPLACE FUNCTION increment_download_count(app_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE games SET download_count = download_count + 1, updated_at = NOW()
  WHERE games.app_id = app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: increment play count
-- ============================================
CREATE OR REPLACE FUNCTION increment_play_count(app_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE games SET play_count = play_count + 1, updated_at = NOW()
  WHERE games.app_id = app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: rate a game (1-5 stars)
-- ============================================
CREATE OR REPLACE FUNCTION rate_game(app_id TEXT, rating INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE games
  SET rating_sum = rating_sum + rating,
      rating_count = rating_count + 1,
      updated_at = NOW()
  WHERE games.app_id = app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS games_updated_at ON games;
CREATE TRIGGER games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS manifests_updated_at ON manifests;
CREATE TRIGGER manifests_updated_at BEFORE UPDATE ON manifests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS game_depot_keys_updated_at ON game_depot_keys;
CREATE TRIGGER game_depot_keys_updated_at BEFORE UPDATE ON game_depot_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS import_jobs_updated_at ON import_jobs;
CREATE TRIGGER import_jobs_updated_at BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS install_requests_updated_at ON install_requests;
CREATE TRIGGER install_requests_updated_at BEFORE UPDATE ON install_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS game_categories_updated_at ON game_categories;
CREATE TRIGGER game_categories_updated_at BEFORE UPDATE ON game_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS refresh_tokens_updated_at ON refresh_tokens;
CREATE TRIGGER refresh_tokens_updated_at BEFORE UPDATE ON refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS: service_role only, no client access
-- ============================================
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_depot_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_categories ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Anyone can read games" ON games;
DROP POLICY IF EXISTS "Anyone can insert games" ON games;
DROP POLICY IF EXISTS "Anyone can update games" ON games;

-- Service role policies (drop first to avoid duplicate errors)
DROP POLICY IF EXISTS "service_role_all_games" ON games;
CREATE POLICY "service_role_all_games" ON games
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_manifests" ON manifests;
CREATE POLICY "service_role_all_manifests" ON manifests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_depot_keys" ON game_depot_keys;
CREATE POLICY "service_role_all_depot_keys" ON game_depot_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_profiles" ON profiles;
CREATE POLICY "service_role_all_profiles" ON profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_tokens" ON refresh_tokens;
CREATE POLICY "service_role_all_tokens" ON refresh_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_jobs" ON import_jobs;
CREATE POLICY "service_role_all_jobs" ON import_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_requests" ON install_requests;
CREATE POLICY "service_role_all_requests" ON install_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_categories" ON game_categories;
CREATE POLICY "service_role_all_categories" ON game_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- Drop old tables if they exist
-- ============================================
DROP TABLE IF EXISTS manifest_index CASCADE;

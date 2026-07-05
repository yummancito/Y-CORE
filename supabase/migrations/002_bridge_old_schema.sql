-- Y-core Schema Bridge: Migrate old schema (supabase_schema.sql) to new schema (001_initial_schema.sql)
-- Run this in Supabase SQL Editor AFTER 001_initial_schema.sql
-- Safe to run on DB with existing data — uses ADD COLUMN IF NOT EXISTS and INSERT ... ON CONFLICT

-- ============================================
-- 1. Add missing columns to existing games table
-- ============================================
ALTER TABLE games ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS header_image_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS library_image_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS developer TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS nsfw BOOLEAN DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS lua_path TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE games ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'y-core' CHECK (source IN ('y-core', 'depotbox'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS depotbox_imported_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Set lua_path for existing games (derive from app_id if not set)
UPDATE games SET lua_path = app_id || '.lua' WHERE lua_path IS NULL;

-- ============================================
-- 2. Create tables that don't exist yet (from 001_initial_schema.sql)
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
-- Profiles are backfilled below and maintained by the API on login/register.

-- Backfill profiles for existing auth users
INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

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
-- 3. Migrate depot_keys from jsonb column to game_depot_keys table
-- ============================================
-- Old format: games.depot_keys = [{"depot_id": "123", "decryption_key": "abc..."}, ...]
INSERT INTO game_depot_keys (app_id, depot_id, decryption_key)
SELECT g.app_id, k->>'depot_id' AS depot_id, k->>'decryption_key' AS decryption_key
FROM games g, jsonb_array_elements(g.depot_keys) AS k
WHERE g.depot_keys IS NOT NULL
  AND g.depot_keys::text != '[]'
  AND k->>'depot_id' IS NOT NULL
  AND k->>'decryption_key' IS NOT NULL
ON CONFLICT (app_id, depot_id) DO NOTHING;

-- ============================================
-- 4. Migrate manifest_files from jsonb column to manifests table
-- ============================================
-- Old format: games.manifest_files = [{"depot_id": "123", "manifest_gid": "456", "file_name": "123_456.manifest", "file_size": 12345}, ...]
INSERT INTO manifests (app_id, depot_id, manifest_gid, file_name, file_size)
SELECT g.app_id, m->>'depot_id', m->>'manifest_gid', m->>'file_name', COALESCE((m->>'file_size')::BIGINT, 0)
FROM games g, jsonb_array_elements(g.manifest_files) AS m
WHERE g.manifest_files IS NOT NULL
  AND g.manifest_files::text != '[]'
  AND m->>'depot_id' IS NOT NULL
  AND m->>'manifest_gid' IS NOT NULL
ON CONFLICT (app_id, depot_id, manifest_gid) DO NOTHING;

-- ============================================
-- 5. Update game_categories to match new schema (add missing columns)
-- ============================================
ALTER TABLE game_categories ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE game_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE game_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- 6. RPCs (create or replace)
-- ============================================
CREATE OR REPLACE FUNCTION increment_download_count(app_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE games SET download_count = download_count + 1, updated_at = NOW()
  WHERE games.app_id = app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_play_count(app_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE games SET play_count = play_count + 1, updated_at = NOW()
  WHERE games.app_id = app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
-- 7. updated_at triggers
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
-- 8. RLS: service_role only
-- ============================================
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_depot_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_categories ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Anyone can read games" ON games;
DROP POLICY IF EXISTS "Anyone can insert games" ON games;
DROP POLICY IF EXISTS "Anyone can update games" ON games;
DROP POLICY IF EXISTS "Anyone can read manifest_index" ON manifest_index;
DROP POLICY IF EXISTS "Anyone can insert manifest_index" ON manifest_index;
DROP POLICY IF EXISTS "Anyone can update manifest_index" ON manifest_index;

-- Service role policies (use IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'games' AND policyname = 'service_role_all_games') THEN
    CREATE POLICY "service_role_all_games" ON games FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manifests' AND policyname = 'service_role_all_manifests') THEN
    CREATE POLICY "service_role_all_manifests" ON manifests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_depot_keys' AND policyname = 'service_role_all_depot_keys') THEN
    CREATE POLICY "service_role_all_depot_keys" ON game_depot_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'service_role_all_profiles') THEN
    CREATE POLICY "service_role_all_profiles" ON profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'refresh_tokens' AND policyname = 'service_role_all_tokens') THEN
    CREATE POLICY "service_role_all_tokens" ON refresh_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'import_jobs' AND policyname = 'service_role_all_jobs') THEN
    CREATE POLICY "service_role_all_jobs" ON import_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'install_requests' AND policyname = 'service_role_all_requests') THEN
    CREATE POLICY "service_role_all_requests" ON install_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_categories' AND policyname = 'service_role_all_categories') THEN
    CREATE POLICY "service_role_all_categories" ON game_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- 9. Drop old manifest_index table
-- ============================================
DROP TABLE IF EXISTS manifest_index CASCADE;

-- ============================================
-- 10. Add indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_games_app_id ON games(app_id);
CREATE INDEX IF NOT EXISTS idx_games_name ON games USING gin (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_games_download_count ON games(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_games_play_count ON games(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_games_uploaded_at ON games(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_is_available ON games(is_available);
CREATE INDEX IF NOT EXISTS idx_games_source ON games(source);
CREATE INDEX IF NOT EXISTS idx_manifests_app_id ON manifests(app_id);
CREATE INDEX IF NOT EXISTS idx_manifests_depot_id ON manifests(depot_id);
CREATE INDEX IF NOT EXISTS idx_depot_keys_app_id ON game_depot_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON import_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_app_id ON import_jobs(app_id);
CREATE INDEX IF NOT EXISTS idx_jobs_stale ON import_jobs(status, heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_install_requests_user ON install_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_install_requests_ip ON install_requests(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_game_categories_category ON game_categories(category);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

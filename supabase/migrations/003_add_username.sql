-- Add username column to profiles
-- Unique username for future social features (comments, ratings, public profiles)

-- Add column with NOT NULL after backfill (see note below)
-- For existing users, set username = email prefix as fallback
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Backfill existing profiles with email prefix as username
UPDATE profiles
SET username = split_part(email, '@', 1)
WHERE username IS NULL;

-- Now enforce NOT NULL + UNIQUE
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- updated_at trigger already exists on profiles

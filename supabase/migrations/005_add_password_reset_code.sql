-- Add human-readable reset code column
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_code ON password_resets(code);

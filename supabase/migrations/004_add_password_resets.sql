-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour'),
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

-- Function to clean up old used/expired tokens
CREATE OR REPLACE FUNCTION cleanup_password_resets()
RETURNS void AS $$
BEGIN
  DELETE FROM password_resets
  WHERE used_at IS NOT NULL OR expires_at < now();
END;
$$ LANGUAGE plpgsql;

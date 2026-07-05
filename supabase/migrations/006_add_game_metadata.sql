-- Store Steam game metadata for Online Fix compatibility detection
CREATE TABLE IF NOT EXISTS game_metadata (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id text UNIQUE NOT NULL,
  name text,
  type text,
  categories integer[] DEFAULT '{}',
  genres integer[] DEFAULT '{}',
  content_descriptors integer[] DEFAULT '{}',
  multiplayer boolean DEFAULT false,
  co_op boolean DEFAULT false,
  online_only boolean DEFAULT false,
  lan boolean DEFAULT false,
  p2p boolean DEFAULT false,
  dedicated_servers boolean DEFAULT false,
  is_adult boolean DEFAULT false,
  is_tool boolean DEFAULT false,
  raw_data jsonb,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_metadata_app_id ON game_metadata(app_id);
CREATE INDEX IF NOT EXISTS idx_game_metadata_multiplayer ON game_metadata(multiplayer);
CREATE INDEX IF NOT EXISTS idx_game_metadata_co_op ON game_metadata(co_op);
CREATE INDEX IF NOT EXISTS idx_game_metadata_is_adult ON game_metadata(is_adult);
CREATE INDEX IF NOT EXISTS idx_game_metadata_is_tool ON game_metadata(is_tool);

ALTER TABLE games ADD COLUMN IF NOT EXISTS is_tool boolean DEFAULT false;

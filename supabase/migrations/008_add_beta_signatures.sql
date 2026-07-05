-- Add beta tester flag to user profiles
alter table profiles add column if not exists is_beta_tester boolean not null default false;

-- Table for Steam signature TOML files (YCoreTool patterns)
create table if not exists steam_signatures (
  component text not null,
  sha256 text not null,
  content text not null,
  status text not null default 'pending',
  source text not null default 'opensteam001',
  beta_success_count integer not null default 0,
  beta_failure_count integer not null default 0,
  pending_reason text,
  last_synced_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  primary key (component, sha256)
);

create index if not exists idx_steam_signatures_status on steam_signatures(status);

-- Table for beta tester signature reports (success/failure)
create table if not exists signature_reports (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  sha256 text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  success boolean not null,
  failure_reason text check (failure_reason in ('download_error', 'ycoretool_popup', 'steam_crash', 'timeout')),
  steam_build_id text,
  reported_at timestamp with time zone default now()
);

create index if not exists idx_signature_reports_signature on signature_reports(component, sha256);

-- Enable RLS
alter table steam_signatures enable row level security;
alter table signature_reports enable row level security;

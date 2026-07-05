-- Events table for telemetry
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  event_type text not null,
  app_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for querying by user
create index if not exists events_user_id_idx on events(user_id);

-- Index for querying by event type
create index if not exists events_event_type_idx on events(event_type);

-- Index for time-based queries
create index if not exists events_created_at_idx on events(created_at desc);

-- RLS: users can only see their own events
alter table events enable row level security;

create policy "Users can view own events"
  on events for select
  using (auth.uid() = user_id);

-- No insert policy via RLS — inserts go through the service role key (getSupabaseAdmin)

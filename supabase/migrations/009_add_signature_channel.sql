-- Add channel column to support both pattern and IPC signature TOML files
-- for YCoreTool. Channels are 'pattern' and 'ipc'.

alter table steam_signatures drop constraint steam_signatures_pkey;
alter table steam_signatures add column if not exists channel text not null default 'pattern';
alter table steam_signatures add constraint steam_signatures_pkey primary key (channel, component, sha256);

create index if not exists idx_steam_signatures_channel_status on steam_signatures(channel, status);

alter table signature_reports add column if not exists channel text not null default 'pattern';

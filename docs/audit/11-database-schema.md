# Y-Core Technical Audit — Phase 11: Database Schema

## Overview

Complete documentation of the Supabase database schema, including all tables, relationships, indexes, RLS policies, and RPCs.

---

## 1. Schema Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  auth.users (Supabase managed)                               │
│       │                                                      │
│       ├── 1:1 ── profiles                                    │
│       │                ├── 1:N ── refresh_tokens             │
│       │                ├── 1:N ── import_jobs                │
│       │                └── 1:N ── events                     │
│       │                                                      │
│       ├── 1:N ── password_resets                             │
│       │                                                      │
│       └── (FK) ── games.uploaded_by                          │
│                                                              │
│  games ── 1:N ── manifests                                   │
│         ── 1:N ── game_depot_keys                            │
│         ── 1:1 ── game_categories                            │
│                                                              │
│  install_requests (no FK to games, soft ref by app_id)       │
│                                                              │
│  game_metadata (standalone, keyed by app_id)                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tables

### 2.1 `profiles`

**Purpose**: Mirror of `auth.users` for FK references and additional user data.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK, FK → auth.users(id) ON DELETE CASCADE | — |
| `email` | TEXT | NOT NULL | — |
| `username` | TEXT | NOT NULL, UNIQUE | — |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Indexes**: `idx_profiles_username` on `username`

**RLS**: Enabled, service_role only

**Triggers**: `profiles_updated_at` — set `updated_at = NOW()` on update

**Migrations**: 001 (create), 003 (add username)

---

### 2.2 `refresh_tokens`

**Purpose**: JWT refresh tokens for session management.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `user_id` | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | — |
| `token_hash` | TEXT | NOT NULL, UNIQUE | — |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — |
| `revoked_at` | TIMESTAMPTZ | nullable | NULL |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Indexes**:
- `idx_refresh_tokens_user` on `user_id`
- `idx_refresh_tokens_hash` on `token_hash`
- `idx_refresh_tokens_expires` on `expires_at`

**RLS**: Enabled, service_role only

**Security**: Tokens are SHA-256 hashed, never stored in plaintext. 30-day expiry. Rotation on refresh (old revoked, new issued).

---

### 2.3 `games`

**Purpose**: Game catalog — the core table for all game metadata.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `app_id` | TEXT | NOT NULL, UNIQUE | — |
| `name` | TEXT | NOT NULL | — |
| `description` | TEXT | nullable | NULL |
| `header_image_url` | TEXT | nullable | NULL |
| `library_image_url` | TEXT | nullable | NULL |
| `developer` | TEXT | nullable | NULL |
| `publisher` | TEXT | nullable | NULL |
| `release_date` | DATE | nullable | NULL |
| `nsfw` | BOOLEAN | | false |
| `is_tool` | BOOLEAN | | false |
| `lua_path` | TEXT | NOT NULL | — |
| `is_available` | BOOLEAN | | true |
| `uploaded_at` | TIMESTAMPTZ | | NOW() |
| `uploaded_by` | UUID | FK → auth.users(id), nullable | NULL |
| `download_count` | INTEGER | | 0 |
| `play_count` | INTEGER | | 0 |
| `rating_sum` | INTEGER | | 0 |
| `rating_count` | INTEGER | | 0 |
| `source` | TEXT | NOT NULL, CHECK IN ('y-core','depotbox') | 'y-core' |
| `depotbox_imported_at` | TIMESTAMPTZ | nullable | NULL |
| `category` | TEXT | nullable | NULL |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Indexes**:
- `idx_games_app_id` on `app_id`
- `idx_games_name` — GIN index on `to_tsvector('simple', name)` (full-text search)
- `idx_games_download_count` on `download_count DESC`
- `idx_games_play_count` on `play_count DESC`
- `idx_games_uploaded_at` on `uploaded_at DESC`
- `idx_games_is_available` on `is_available`
- `idx_games_source` on `source`

**RLS**: Enabled, service_role only

**Triggers**: `games_updated_at`

**Computed values** (in API queries):
- `rating_avg` = `rating_sum / NULLIF(rating_count, 0)` (computed in query, not stored)

---

### 2.4 `manifests`

**Purpose**: Manifest file metadata (depot ID, manifest GID, file info).

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `app_id` | TEXT | NOT NULL, FK → games(app_id) ON DELETE CASCADE | — |
| `depot_id` | TEXT | NOT NULL | — |
| `manifest_gid` | TEXT | NOT NULL | — |
| `file_name` | TEXT | NOT NULL | — |
| `file_size` | BIGINT | | 0 |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Constraints**: `UNIQUE(app_id, depot_id, manifest_gid)`

**Indexes**: `idx_manifests_app_id`, `idx_manifests_depot_id`

**RLS**: Enabled, service_role only

---

### 2.5 `game_depot_keys`

**Purpose**: Depot decryption keys for Steam content.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `app_id` | TEXT | NOT NULL, FK → games(app_id) ON DELETE CASCADE | — |
| `depot_id` | TEXT | NOT NULL | — |
| `decryption_key` | TEXT | NOT NULL | — |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Constraints**: `UNIQUE(app_id, depot_id)`

**Index**: `idx_depot_keys_app_id`

**RLS**: Enabled, service_role only

**Security**: Only accessible via API with JWT + install request validation

---

### 2.6 `import_jobs`

**Purpose**: DepotBox import job queue.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `app_id` | TEXT | NOT NULL | — |
| `user_id` | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | — |
| `status` | TEXT | NOT NULL, CHECK IN ('queued','processing','completed','failed') | 'queued' |
| `attempts` | INTEGER | | 0 |
| `error_message` | TEXT | nullable | NULL |
| `result` | JSONB | nullable | NULL |
| `started_at` | TIMESTAMPTZ | nullable | NULL |
| `heartbeat_at` | TIMESTAMPTZ | nullable | NULL |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Indexes**:
- `idx_jobs_status` on `(status, updated_at)`
- `idx_jobs_user` on `user_id`
- `idx_jobs_app_id` on `app_id`
- `idx_jobs_stale` on `(status, heartbeat_at)`

**RLS**: Enabled, service_role only

---

### 2.7 `install_requests`

**Purpose**: Install rate limiting audit log.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `user_id` | UUID | NOT NULL | — |
| `app_id` | TEXT | NOT NULL | — |
| `source` | TEXT | NOT NULL, CHECK IN ('y-core','depotbox') | — |
| `ip_address` | TEXT | nullable | NULL |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Indexes**:
- `idx_install_requests_user` on `(user_id, created_at)`
- `idx_install_requests_ip` on `(ip_address, created_at)`

**RLS**: Enabled, service_role only

**Note**: No FK to `games` table — allows logging even if game doesn't exist yet.

---

### 2.8 `game_categories`

**Purpose**: Game category and tags mapping.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `app_id` | TEXT | PK, FK → games(app_id) ON DELETE CASCADE | — |
| `category` | TEXT | NOT NULL | — |
| `tags` | JSONB | | `'[]'::jsonb` |
| `created_at` | TIMESTAMPTZ | | NOW() |
| `updated_at` | TIMESTAMPTZ | | NOW() |

**Index**: `idx_game_categories_category` on `category`

**RLS**: Enabled, service_role only

---

### 2.9 `events`

**Purpose**: Telemetry/analytics events.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `user_id` | UUID | FK → profiles(id) ON DELETE SET NULL, nullable | NULL |
| `event_type` | TEXT | NOT NULL | — |
| `app_id` | TEXT | nullable | NULL |
| `metadata` | JSONB | | `'{}'::jsonb` |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() |

**Indexes**:
- `events_user_id_idx` on `user_id`
- `events_event_type_idx` on `event_type`
- `events_created_at_idx` on `created_at DESC`

**RLS**: Enabled
- SELECT: `auth.uid() = user_id` (users can see own events)
- INSERT: service_role only (no RLS insert policy)

**Event Types**: `game_installed`, `game_uninstalled`, `game_launched`, `game_searched`, `depotbox_import_started`, `depotbox_import_completed`, `depotbox_import_failed`, `manifest_downloaded`, `user_registered`, `user_login`

---

### 2.10 `password_resets`

**Purpose**: Password reset tokens and codes.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `user_id` | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | — |
| `token` | UUID | NOT NULL, UNIQUE | gen_random_uuid() |
| `code` | TEXT | nullable, UNIQUE | NULL |
| `expires_at` | TIMESTAMPTZ | NOT NULL | NOW() + 1 hour |
| `used_at` | TIMESTAMPTZ | nullable | NULL |
| `created_at` | TIMESTAMPTZ | | NOW() |

**Indexes**: `idx_password_resets_token`, `idx_password_resets_user_id`, `idx_password_resets_code`

**RPC**: `cleanup_password_resets()` — deletes used/expired tokens

---

### 2.11 `game_metadata`

**Purpose**: Steam game metadata for OnlineFix compatibility detection.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | UUID | PK | gen_random_uuid() |
| `app_id` | TEXT | UNIQUE, NOT NULL | — |
| `name` | TEXT | nullable | NULL |
| `type` | TEXT | nullable | NULL |
| `categories` | INTEGER[] | | `'{}'` |
| `genres` | INTEGER[] | | `'{}'` |
| `content_descriptors` | INTEGER[] | | `'{}'` |
| `multiplayer` | BOOLEAN | | false |
| `co_op` | BOOLEAN | | false |
| `online_only` | BOOLEAN | | false |
| `lan` | BOOLEAN | | false |
| `p2p` | BOOLEAN | | false |
| `dedicated_servers` | BOOLEAN | | false |
| `is_adult` | BOOLEAN | | false |
| `is_tool` | BOOLEAN | | false |
| `raw_data` | JSONB | nullable | NULL |
| `fetched_at` | TIMESTAMPTZ | | NOW() |
| `created_at` | TIMESTAMPTZ | | NOW() |

**Indexes**: `idx_game_metadata_app_id`, `idx_game_metadata_multiplayer`, `idx_game_metadata_co_op`, `idx_game_metadata_is_adult`, `idx_game_metadata_is_tool`

---

## 3. Stored Procedures (RPCs)

### 3.1 `increment_download_count(app_id TEXT)`

```sql
UPDATE games SET download_count = download_count + 1, updated_at = NOW()
WHERE games.app_id = app_id;
```

### 3.2 `increment_play_count(app_id TEXT)`

```sql
UPDATE games SET play_count = play_count + 1, updated_at = NOW()
WHERE games.app_id = app_id;
```

### 3.3 `rate_game(app_id TEXT, rating INTEGER)`

```sql
UPDATE games
SET rating_sum = rating_sum + rating,
    rating_count = rating_count + 1,
    updated_at = NOW()
WHERE games.app_id = app_id;
```

### 3.4 `cleanup_password_resets()`

```sql
DELETE FROM password_resets
WHERE used_at IS NOT NULL OR expires_at < now();
```

### 3.5 `update_updated_at()`

```sql
-- Trigger function: set NEW.updated_at = NOW() before UPDATE
```

---

## 4. Row Level Security (RLS) Summary

| Table | RLS | Policy |
|-------|-----|--------|
| `profiles` | Enabled | service_role ALL |
| `refresh_tokens` | Enabled | service_role ALL |
| `games` | Enabled | service_role ALL |
| `manifests` | Enabled | service_role ALL |
| `game_depot_keys` | Enabled | service_role ALL |
| `import_jobs` | Enabled | service_role ALL |
| `install_requests` | Enabled | service_role ALL |
| `game_categories` | Enabled | service_role ALL |
| `events` | Enabled | SELECT: auth.uid() = user_id; INSERT: service_role only |
| `password_resets` | Not explicitly enabled | (assumed service_role access) |
| `game_metadata` | Not explicitly enabled | (assumed service_role access) |

**Key principle**: All tables use service_role only. No direct client access to the database. All data flows through the Y-Core API which uses the service role key.

---

## 5. Migration History

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Core tables, RPCs, triggers, RLS |
| `002_events_table.sql` | Events table for telemetry |
| `002_bridge_old_schema.sql` | Bridge migration for old schema |
| `003_add_username.sql` | Add username column to profiles |
| `004_add_password_resets.sql` | Password reset tokens table |
| `005_add_password_reset_code.sql` | Add 6-digit human-readable code |
| `006_add_game_metadata.sql` | Game metadata table + is_tool column on games |

**Note**: Two files share the `002_` prefix — potential ordering ambiguity.

---

## 6. Entity Relationships

```
auth.users (Supabase)
    │
    ├── 1:1 → profiles (id = auth.users.id)
    │           │
    │           ├── 1:N → refresh_tokens (user_id)
    │           ├── 1:N → import_jobs (user_id)
    │           └── 1:N → events (user_id)
    │
    ├── 1:N → password_resets (user_id)
    │
    └── 1:N → games.uploaded_by (nullable)

games (app_id UNIQUE)
    ├── 1:N → manifests (app_id, CASCADE)
    ├── 1:N → game_depot_keys (app_id, CASCADE)
    └── 1:1 → game_categories (app_id, CASCADE)

install_requests (standalone, no FK to games)
game_metadata (standalone, app_id UNIQUE)
```

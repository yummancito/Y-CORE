# Y-Core Technical Audit — Phase 10: API Route Map

## Overview

Complete map of all backend API routes, their authentication requirements, rate limits, and data flow.

---

## 1. API Server Configuration (`apps/api/src/index.ts`)

### 1.1 Server Setup

```
Fastify server →
  1. Port: process.env.PORT || 3000
  2. Logger: process.env.LOG_LEVEL || 'info'
  3. CORS: @fastify/cors
     - origin: CORS_ORIGIN env var (comma-separated) or '*' in dev
     - methods: GET, POST, PUT, DELETE, OPTIONS
  4. JWT: @fastify/jwt
     - secret: JWT_SECRET env var
     - sign: { expiresIn: JWT_ACCESS_EXPIRY || '15m' }
  5. Rate limiting: @fastify/rate-limit
     - global: GLOBAL_RATE_LIMIT_MAX || 300 per minute
     - install: 20 per 10 minutes (custom rule)
  6. Plugins:
     - authPlugin (fastify-plugin) — decorates fastify.authenticate
  7. Routes:
     - authRoutes (prefix: none, paths include /api/auth/*)
     - gameRoutes (prefix: none, paths include /api/games/*, /api/search)
     - jobRoutes (prefix: none, path /api/jobs/:job_id)
     - manifestRoutes (prefix: none, path /api/manifests/*)
  8. Health check: GET /health → { status: 'ok' }
  9. Self-ping (optional): setInterval to RENDER_EXTERNAL_URL || PUBLIC_URL
```

### 1.2 Middleware Pipeline

```
Request →
  1. CORS check
  2. Rate limit check (global or route-specific)
  3. Route match
  4. preHandler (if fastify.authenticate) → JWT verification
  5. Handler
  6. Response
```

---

## 2. Complete Route Inventory

### 2.1 Authentication Routes (`apps/api/src/routes/auth.ts`)

| # | Method | Path | Auth | Rate Limit | Zod Validation | Purpose |
|---|--------|------|------|------------|----------------|---------|
| 1 | POST | `/api/auth/register` | None | Global | email, password (8-72), username (3-32, alphanumeric) | Create account |
| 2 | POST | `/api/auth/login` | None | Global | email, password (1+) | Login, get tokens |
| 3 | POST | `/api/auth/refresh` | None | Global | refresh_token (UUID) | Refresh access token |
| 4 | POST | `/api/auth/forgot-password` | None | Global | email | Send reset code via email |
| 5 | POST | `/api/auth/reset-password` | None | Global | code (6-8), password (8-72) | Reset password with code |
| 6 | POST | `/api/auth/logout` | **JWT** | Global | refresh_token (UUID) | Revoke refresh token |

#### Route Details

**POST /api/auth/register**
```
Request: { email, password, username }
Response 201: { access_token, refresh_token, user: { id, email, username } }
Errors: 409 (email/username taken), 400 (Supabase auth error)
Side effects: Supabase Auth signup, profile creation, refresh token creation, telemetry event
```

**POST /api/auth/login**
```
Request: { email, password }
Response 200: { access_token, refresh_token, user: { id, email, username } }
Errors: 401 (invalid credentials)
Side effects: Profile upsert, refresh token creation, telemetry event
```

**POST /api/auth/refresh**
```
Request: { refresh_token }
Response 200: { access_token, refresh_token }
Errors: 401 (invalid/expired/revoked token)
Side effects: Old token revoked, new token created (rotation)
```

**POST /api/auth/forgot-password**
```
Request: { email }
Response 200: { message: "If this email is registered, a reset code has been sent" }
Side effects: Cleanup old tokens, generate 6-digit code, insert password_resets, send email via Resend
Note: Always returns 200 to prevent email enumeration
```

**POST /api/auth/reset-password**
```
Request: { code, password }
Response 200: { message: "Password reset successfully" }
Errors: 400 (invalid/expired code)
Side effects: Supabase admin password update, mark code as used
```

**POST /api/auth/logout**
```
Request: { refresh_token }
Response: 204
Side effects: Revoke refresh token (set revoked_at)
```

---

### 2.2 Game Routes (`apps/api/src/routes/games.ts`)

| # | Method | Path | Auth | Rate Limit | Purpose |
|---|--------|------|------|------------|---------|
| 7 | GET | `/api/search` | None | Global | Search catalog + DepotBox |
| 8 | GET | `/api/games` | None | Global | List games with filters |
| 9 | GET | `/api/games/:app_id` | None | Global | Get game details |
| 10 | POST | `/api/games/:app_id/install` | **JWT** | 20/10min | Install game (ready or queued) |
| 11 | POST | `/api/games/:app_id/downloaded` | **JWT** | Global | Report download, increment count |
| 12 | GET | `/api/games/:app_id/onlinefix-compat` | None | Global | Check OnlineFix compatibility |
| 13 | POST | `/api/games/onlinefix-compat` | None | Global | Batch OnlineFix compatibility |
| 14 | GET | `/api/games/:app_id/depot-keys` | **JWT** | Global | Get depot decryption keys |

#### Route Details

**GET /api/search**
```
Query: q (min 2 chars), limit (max 100), filter_nsfw (all|exclude|only)
Response: { games: [{ app_id, name, header_image_url, source, is_dlc? }], total, sources }
Auth: None (public endpoint)
Data sources: Supabase games table (ILIKE search) + DepotBox API search
```

**GET /api/games**
```
Query: search?, category?, sort (name|downloads|rating|recent), limit, offset, is_dlc?
Response: { games: GameSummary[], total }
Auth: None (public endpoint)
DB: SELECT from games + game_categories (LEFT JOIN)
```

**GET /api/games/:app_id**
```
Response: GameDetail (full game info)
Auth: None (public endpoint)
DB: SELECT from games WHERE app_id = ?
Errors: 404 if not found
```

**POST /api/games/:app_id/install**
```
Auth: JWT required
Rate limit: 20 per 10 minutes (per user + IP)
Response:
  - { status: 'ready', game: InstallGameData } — if game has all data
  - { status: 'queued', job_id } — if import needed
Side effects:
  - Log to install_requests table
  - If queued: create import_job, processDepotBoxImport (inline)
  - If ready: fetch Lua from GitHub, manifests + depot keys from DB
```

**POST /api/games/:app_id/downloaded**
```
Auth: JWT required
Response: 204
Side effects: RPC increment_download_count(app_id)
```

**GET /api/games/:app_id/onlinefix-compat**
```
Response: { status: 'compatible'|'incompatible'|'unknown', reason? }
Auth: None
DB: SELECT from game_metadata WHERE app_id = ?
Logic: Check multiplayer, co_op, online_only, p2p, dedicated_servers flags
```

**POST /api/games/onlinefix-compat**
```
Body: { app_ids: string[] }
Response: Record<app_id, { status, reason? }>
Auth: None
DB: Batch SELECT from game_metadata
```

**GET /api/games/:app_id/depot-keys**
```
Auth: JWT required
Precondition: install_requests record must exist for this user+app
Response: [{ depot_id, decryption_key }]
Errors: 403 (no install request), 404 (no keys)
DB: SELECT from game_depot_keys WHERE app_id = ?
Security: Only returned to users with active install request
```

---

### 2.3 Job Routes (`apps/api/src/routes/jobs.ts`)

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 15 | GET | `/api/jobs/:job_id` | **JWT** | Get import job status |

**GET /api/jobs/:job_id**
```
Auth: JWT required
Response: { id, app_id, status, attempts, error_message, result, created_at, updated_at }
DB: SELECT from import_jobs WHERE id = ? AND user_id = ?
Security: User can only see their own jobs
Note: result.depot_keys is always stripped to empty array
```

---

### 2.4 Manifest Routes (`apps/api/src/routes/manifests.ts`)

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 16 | GET | `/api/manifests/:app_id/:depot_id/:manifest_gid` | **JWT** | Download manifest file |

**GET /api/manifests/:app_id/:depot_id/:manifest_gid**
```
Auth: JWT required
Response: Binary file (application/octet-stream)
Headers: Content-Disposition: attachment; filename="{file_name}"
Flow:
  1. Verify manifest exists in DB (manifests table)
  2. Fetch from GitHub raw content URL
  3. Return as binary
Errors: 404 (not in DB or not in GitHub), 500 (download failure)
```

---

### 2.5 Health Check

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 17 | GET | `/health` | None | Server health check |

---

## 3. Authentication Requirements

| Requirement | Implementation |
|-------------|---------------|
| JWT verification | `fastify.authenticate` preHandler |
| Token format | `Bearer {jwt}` in Authorization header |
| Token expiry | 15 minutes (configurable via `JWT_ACCESS_EXPIRY`) |
| Token refresh | Client-side auto-refresh on 401 |
| Public endpoints | `/api/games`, `/api/search`, `/api/games/:app_id`, `/api/games/:app_id/onlinefix-compat`, `/api/auth/*`, `/health` |

### Public vs Protected

| Type | Endpoints |
|------|-----------|
| **Public** (no auth) | Search, list games, game details, onlinefix compat, auth endpoints, health |
| **Protected** (JWT required) | Install, downloaded, depot-keys, jobs, manifests, logout |

---

## 4. Rate Limiting

| Scope | Limit | Window | Key |
|-------|-------|--------|-----|
| Global | 300 req | 1 minute | IP address |
| Install | 20 req | 10 minutes | userId + IP |

### Install Rate Limit Configuration

```typescript
fastify.route({
  method: 'POST',
  url: '/api/games/:app_id/install',
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '10 minutes',
      keyGenerator: (req) => `${req.user.userId}:${req.ip}`,
    },
  },
})
```

---

## 5. Request/Response Data Types

### 5.1 Shared Types (from `@y-core/shared`)

| Type | Used By |
|------|---------|
| `AuthSession` | register, login responses |
| `GameSummary` | list games response |
| `GameDetail` | game details response |
| `GameListResponse` | list games response |
| `InstallResponse` | install response |
| `InstallGameData` | install ready response, job result |
| `JobResponse` | job status response |
| `ManifestFile` | install game data |
| `DepotKey` | install game data |
| `ApiError` | error responses |

### 5.2 Zod Validation Schemas

| Schema | Fields | Route |
|--------|--------|-------|
| RegisterSchema | email, password (8-72), username (3-32, `/^[a-zA-Z0-9_-]+$/`) | register |
| LoginSchema | email, password (1+) | login |
| RefreshSchema | refresh_token (UUID) | refresh, logout |
| ForgotPasswordSchema | email | forgot-password |
| ResetPasswordSchema | code (6-8), password (8-72) | reset-password |

---

## 6. External API Calls

| Service | Endpoint | Used By | Auth |
|---------|----------|---------|------|
| DepotBox | `POST /api/download` | install (import) | X-API-Key |
| DepotBox | `GET /api/status/{token}` | install (import) | X-API-Key |
| DepotBox | `GET {downloadLink}` | install (import) | X-API-Key |
| DepotBox | `POST /api/search-games` | search | X-API-Key |
| Steam Store | `GET /api/appdetails?appids={id}` | import, isSteamGame | None |
| SteamSpy | `GET /api.php?request=appdetails&appid={id}` | isSteamGame | None |
| GitHub | `GET /repos/{repo}/contents/{path}` | manifest download, Lua fetch | token |
| GitHub | `PUT /repos/{repo}/contents/{path}` | Lua + manifest upload | token |
| GitHub | `GET raw.githubusercontent.com/...` | manifest file download | token |
| Resend | `POST /emails` | password reset | Bearer |
| Supabase | Auth + DB | All auth + data operations | service_role / anon |

---

## 7. API Error Response Format

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE",
  "details": "OPTIONAL_ADDITIONAL_INFO"
}
```

### Common Error Codes

| HTTP Status | Meaning | Example |
|-------------|---------|---------|
| 400 | Bad request | Validation error, Supabase auth error |
| 401 | Unauthorized | Invalid credentials, expired token |
| 403 | Forbidden | No install request for depot keys |
| 404 | Not found | Game, manifest, or job not found |
| 409 | Conflict | Email/username already taken |
| 429 | Rate limited | Too many install requests |
| 500 | Server error | DB failure, GitHub upload failure |

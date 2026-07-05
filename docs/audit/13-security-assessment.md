# Y-Core Technical Audit — Phase 13: Security Assessment

## Overview

Comprehensive security analysis of the Y-Core application covering authentication, data protection, IPC security, API security, and potential vulnerabilities.

---

## 1. Authentication Security

### 1.1 JWT Implementation

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Algorithm | HMAC-SHA256 (default in @fastify/jwt) | ✅ Standard |
| Secret | `JWT_SECRET` env var | ✅ Externalized |
| Expiry | 15 minutes (configurable) | ✅ Short-lived |
| Payload | `{ userId, email, username }` | ✅ Minimal |
| Verification | `fastify.jwt.verify(token)` | ✅ Server-side |
| Dev default | `'dev-secret-change-in-production'` | ⚠️ Fallback exists |

**Risk**: If `JWT_SECRET` is not set in production, the app falls back to a known dev secret. The config validation (`config.ts`) catches this in production mode, but the check is bypassed if `NODE_ENV !== 'production'`.

**Recommendation**: Fail hard if `JWT_SECRET` is missing or equals the dev default, regardless of `NODE_ENV`.

### 1.2 Refresh Token Security

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Token format | UUID v4 | ✅ 122-bit entropy |
| Storage | SHA-256 hashed in DB | ✅ Not plaintext |
| Rotation | Old token revoked on refresh | ✅ Prevents replay |
| Expiry | 30 days | ⚠️ Long-lived |
| Revocation | `revoked_at` timestamp | ✅ Supported |
| Bulk revocation | `revokeAllUserTokens()` | ✅ Available |

**Risk**: 30-day refresh token expiry is long. If a token is compromised, the attacker has a month to use it.

**Recommendation**: Consider 7-day expiry with sliding window (extend on each refresh).

### 1.3 Password Security

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Storage | Supabase Auth (bcrypt) | ✅ Industry standard |
| Min length | 8 characters | ✅ Adequate |
| Max length | 72 characters | ✅ bcrypt limit |
| Reset flow | 6-digit code, 1h expiry, single-use | ⚠️ See below |

### 1.4 Password Reset Code Security

| Aspect | Value | Risk |
|--------|-------|------|
| Format | 6-digit numeric | 10^6 = 1M combinations |
| Expiry | 1 hour | ⚠️ |
| Single use | Yes (used_at timestamp) | ✅ |
| Rate limit | Global only (300/min) | ⚠️ No specific rate limit |

**Risk**: 6-digit code with 1-hour window and no specific rate limit on the reset endpoint. An attacker could brute-force the code at 300 requests/minute (global rate limit), giving 18,000 attempts in 1 hour — 1.8% chance of success per code.

**Recommendation**: Add a specific rate limit on `/api/auth/reset-password` (e.g., 5 attempts per 10 minutes per IP) and add attempt tracking with lockout after 5 failed attempts.

---

## 2. Token Storage Security

### 2.1 Renderer (localStorage)

| Aspect | Risk | Mitigation |
|--------|------|------------|
| XSS attack | ⚠️ High — tokens in localStorage accessible via XSS | CSP policy in place |
| CSRF attack | ✅ Not vulnerable — no cookies used | N/A |
| Physical access | ⚠️ Medium — tokens persist after app close | Tokens expire |

**Current CSP** (from main.ts):
```
default-src: 'self'
script-src: 'self' 'unsafe-inline'
style-src: 'self' 'unsafe-inline'
img-src: 'self' https: data: blob:
connect-src: 'self' https://api.y-core.app https://depotbox.org https://store.steampowered.com https://steamcdn-a.akamaihd.net https://steamspy.com
```

**Risk**: `'unsafe-inline'` in `script-src` weakens XSS protection. This is required for React's inline styles and Vite's HMR in dev, but in production it should be tightened.

**Recommendation**: Use nonce-based CSP for scripts in production builds. Remove `'unsafe-inline'` for `script-src`.

### 2.2 Electron Main Process

| Aspect | Risk | Mitigation |
|--------|------|------------|
| In-memory only | ✅ Lost on app close | N/A |
| Not persisted to disk | ✅ No file storage | N/A |
| Accessible from renderer | ⚠️ Via IPC only | contextBridge |

### 2.3 Token Sync

Tokens are synced between renderer (localStorage) and main process (in-memory) via `auth:setSession` IPC. Both locations must be cleared on logout.

---

## 3. API Security

### 3.1 CORS Configuration

```typescript
cors({
  origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})
```

**Risk**: In development, `CORS_ORIGIN` defaults to `'*'` (allow all origins). In production, it must be set to specific origins.

**Recommendation**: Fail if `CORS_ORIGIN` is not set in production (add to `validateConfig()`).

### 3.2 Rate Limiting

| Scope | Limit | Key | Rating |
|-------|-------|-----|--------|
| Global | 300/min | IP | ✅ Adequate |
| Install | 20/10min | userId + IP | ✅ Good |
| Auth endpoints | None specific | — | ⚠️ See below |
| Password reset | None specific | — | ⚠️ See above |

**Risk**: No specific rate limit on auth endpoints (login, register, forgot-password). An attacker could attempt brute-force login at 300/min.

**Recommendation**: Add rate limits:
- Login: 10 attempts per 10 minutes per IP
- Register: 5 per hour per IP
- Forgot password: 5 per hour per IP/email
- Reset password: 10 per hour per IP

### 3.3 Input Validation

| Endpoint | Validation | Rating |
|----------|-----------|--------|
| Register | Zod (email, password 8-72, username 3-32 regex) | ✅ |
| Login | Zod (email, password 1+) | ✅ |
| Refresh | Zod (UUID) | ✅ |
| Forgot password | Zod (email) | ✅ |
| Reset password | Zod (code 6-8, password 8-72) | ✅ |
| Install | App ID from URL param | ⚠️ No Zod |
| Search | Query min 2 chars | ✅ Manual check |
| Depot keys | App ID from URL param | ⚠️ No Zod |

**Risk**: Game-related endpoints don't use Zod validation. App IDs are passed as URL parameters without schema validation.

**Recommendation**: Add Zod validation for all endpoints, even if just `z.string().regex(/^\d+$/)` for app IDs.

### 3.4 Depot Key Access Control

```
GET /api/games/:app_id/depot-keys →
  1. JWT auth required
  2. Check install_requests table for this user + app
  3. Only return keys if install request exists
```

**Rating**: ✅ Good — depot keys are gated behind install request validation.

**Risk**: An install request persists indefinitely. A user who once installed a game can always fetch its depot keys later.

**Recommendation**: Consider time-limiting the install request check (e.g., only return keys if request was made within the last hour).

---

## 4. IPC Security (Electron)

### 4.1 Context Isolation

| Setting | Value | Rating |
|---------|-------|--------|
| `contextIsolation` | `true` | ✅ |
| `nodeIntegration` | `false` | ✅ |
| `sandbox` | Not set (default: false) | ⚠️ |

**Recommendation**: Enable `sandbox: true` for additional renderer process isolation.

### 4.2 IPC Channel Validation

Most IPC handlers validate inputs:

| Check | Implemented | Rating |
|-------|-------------|--------|
| App ID format validation | `isValidAppId()` in some handlers | ⚠️ Inconsistent |
| File path validation | Not consistently | ⚠️ |
| Input sanitization | Minimal | ⚠️ |

**Risk**: Some IPC handlers accept file paths or app IDs without thorough validation. A compromised renderer could potentially pass malicious paths.

**Recommendation**: Add consistent input validation to all IPC handlers that accept user input.

### 4.3 Sensitive IPC Channels

| Channel | Risk | Mitigation |
|---------|------|------------|
| `steam:deleteGame` | Deletes files | ⚠️ No confirmation in IPC |
| `steam:importGameFolder` | Reads arbitrary folder | ⚠️ No path restriction |
| `config:write` | Writes config file | ✅ Size limit (256KB), type check |
| `store:installGame` | Writes to Steam dirs | ⚠️ No path validation on lua_content |

---

## 5. Data Security

### 5.1 Database Access

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Service role key | Used for all DB operations | ✅ Full access |
| RLS | Enabled on all tables | ✅ Defense in depth |
| Client access | None (no direct Supabase from renderer) | ✅ |
| Key exposure | `SUPABASE_SERVICE_KEY` in API env | ✅ Server-side only |

### 5.2 Depot Keys

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Storage | `game_depot_keys` table, service_role only | ✅ |
| Transit | HTTPS (assumed) | ✅ |
| API access | JWT + install request required | ✅ |
| Job results | Stripped from job response | ✅ |
| Electron storage | Injected into config.vdf (plaintext) | ⚠️ Inherent to Steam |

**Note**: Depot keys must be plaintext in `config.vdf` for Steam to use them. This is a Steam limitation, not a Y-Core issue.

### 5.3 GitHub Token

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Storage | `GITHUB_TOKEN` env var | ✅ |
| Usage | API server only | ✅ |
| Scope | Repo contents read/write | ⚠️ Broad |

**Recommendation**: Use a fine-grained PAT with access only to the manifests repo, not all repos.

---

## 6. External Service Security

### 6.1 DepotBox API

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Auth | `X-API-Key` header | ✅ |
| Key storage | `DEPOTBOX_API_KEY` env var | ✅ |
| Key in Electron | Also used by Electron for direct API calls | ⚠️ Key in client |
| HTTPS | Yes (https://depotbox.org) | ✅ |

**Risk**: The DepotBox API key is used both server-side (API) and client-side (Electron). In the Electron app, the key could be extracted from the packaged application.

**Recommendation**: Route all DepotBox API calls through the Y-Core API server. Remove direct DepotBox calls from Electron.

### 6.2 SteamSpy API

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Auth | None (public API) | ✅ |
| Rate limit | 200ms between batches | ✅ Self-imposed |
| Data | Used for app type checking | ✅ Read-only |

### 6.3 Resend Email

| Aspect | Implementation | Rating |
|--------|---------------|--------|
| Auth | `RESEND_API_KEY` env var | ✅ |
| Usage | Password reset emails only | ✅ |
| From address | `RESEND_FROM_EMAIL` env var | ✅ |

---

## 7. Vulnerability Summary

### 7.1 High Priority

| # | Vulnerability | Impact | Recommendation |
|---|--------------|--------|----------------|
| 1 | No rate limit on auth endpoints | Brute-force login attacks | Add per-endpoint rate limits |
| 2 | 6-digit reset code, no attempt limit | Password reset brute-force | Add attempt tracking + lockout |
| 3 | DepotBox API key in Electron client | Key extraction from packaged app | Route through API server |
| 4 | `unsafe-inline` in CSP | XSS attack surface | Use nonce-based CSP in prod |

### 7.2 Medium Priority

| # | Vulnerability | Impact | Recommendation |
|---|--------------|--------|----------------|
| 5 | Refresh token 30-day expiry | Long window if compromised | Reduce to 7 days |
| 6 | No Zod validation on game endpoints | Unexpected input | Add schema validation |
| 7 | Missing native deps in package.json | Build/runtime failures | Add to optionalDependencies |
| 8 | Install request persists indefinitely | Depot key access after install | Time-limit install request check |
| 9 | JWT dev secret fallback | Token forgery if misconfigured | Fail hard if missing |
| 10 | Sandbox not enabled | Renderer escape potential | Enable sandbox: true |

### 7.3 Low Priority

| # | Vulnerability | Impact | Recommendation |
|---|--------------|--------|----------------|
| 11 | GitHub token scope too broad | Unauthorized repo access if leaked | Use fine-grained PAT |
| 12 | No IPC input validation consistency | Potential injection | Add validation to all handlers |
| 13 | CORS defaults to '*' in dev | Cross-origin requests | Fail if not set in prod |
| 14 | No CSRF protection needed | N/A (no cookies) | ✅ Not applicable |
| 15 | No SQL injection risk | N/A (Supabase client) | ✅ Parameterized queries |

---

## 8. Security Best Practices Compliance

| Practice | Status | Notes |
|----------|--------|-------|
| Password hashing | ✅ | Supabase Auth (bcrypt) |
| JWT short expiry | ✅ | 15 minutes |
| Refresh token rotation | ✅ | Old revoked on refresh |
| HTTPS for API | ✅ | Production assumed HTTPS |
| RLS on all tables | ✅ | Service_role only |
| Input validation (auth) | ✅ | Zod schemas |
| Rate limiting (global) | ✅ | 300/min |
| Rate limiting (install) | ✅ | 20/10min |
| Rate limiting (auth) | ❌ | Missing |
| CSP | ⚠️ | Has unsafe-inline |
| Context isolation | ✅ | Enabled |
| Node integration | ✅ | Disabled |
| Sandbox | ❌ | Not enabled |
| Secret management | ✅ | Env vars |
| Dependency auditing | ⚠️ | No audit in CI |

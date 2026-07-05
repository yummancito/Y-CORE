# Y-Core Technical Audit — Phase 03: Login & Auth Flow

## Overview

This document traces the complete authentication flow: login, registration, token management, session persistence, and logout.

---

## 1. Authentication Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Renderer   │────▶│  Electron    │────▶│  Y-Core API  │
│  (React)    │     │  (Main Proc) │     │  (Fastify)   │
└─────────────┘     └──────────────┘     └──────────────┘
     │                    │                      │
     │  localStorage      │  authSession         │  Supabase Auth
     │  (ycore_session)   │  (in-memory)         │  + profiles table
     │                    │                      │  + refresh_tokens
     ▼                    ▼                      ▼
  JWT access token    JWT access token       Supabase Auth
  + refresh token     + refresh token        (password verification)
```

**Key design decisions**:
- JWT access tokens are short-lived (15min default) and signed by the API
- Refresh tokens are UUID v4, SHA-256 hashed, stored in `refresh_tokens` table
- Tokens are stored in BOTH localStorage (renderer) and in-memory (Electron main)
- Electron main process can independently refresh tokens for manifest downloads
- Supabase Auth is used for password verification only (not session management)

---

## 2. Login Flow

### 2.1 User Interaction (`src/pages/LoginPage.tsx`)

```
1. User enters email + password
2. Clicks "Login" button
3. handleSubmit() →
   useAuthStore.login(email, password)
```

### 2.2 Auth Store (`src/stores/useAuthStore.ts:74-83`)

```
login(email, password) →
  1. set({ loading: true, error: null })
  2. const session = await api.login(email, password)
  3. syncToElectron({ access_token, refresh_token })
     → window.steamtools.setAuthSession(session)
  4. set({ user: session.user, loading: false })
  5. await window.steamtools.loginSuccess()
     → Triggers Electron to close login window, create main window
```

### 2.3 API Client (`src/lib/y-core-api.ts:149-156`)

```
login(email, password) →
  1. POST /api/auth/login { email, password }
  2. Response: { access_token, refresh_token, user: { id, email, username } }
  3. setToken({ accessToken, refreshToken })
     → localStorage.setItem('ycore_session', JSON.stringify({ accessToken, refreshToken }))
     → window.steamtools.setAuthSession({ access_token, refresh_token })
  4. Return session
```

### 2.4 API Endpoint (`apps/api/src/routes/auth.ts:96-136`)

```
POST /api/auth/login →
  1. Validate input: zod schema { email: string.email, password: string.min(1) }
  2. Supabase Auth: signInWithPassword(email, password)
     → If error: return 401 { error: 'Invalid credentials' }
  3. Get userId from authData.user.id
  4. Upsert profile: { id: userId, email } → profiles table
  5. Fetch username from profiles table
     → Fallback: email.split('@')[0]
  6. Create refresh token:
     → crypto.randomUUID() → token
     → SHA-256 hash → token_hash
     → Insert into refresh_tokens: { user_id, token_hash, expires_at: now+30d }
  7. Sign JWT: { userId, email, username } with JWT_SECRET, expiry 15m
  8. trackEvent({ userId, eventType: 'user_login' })
  9. Return: { access_token, refresh_token, user: { id, email, username } }
```

### 2.5 Electron: `auth:loginSuccess` Handler (`main.ts:~519`)

```
ipcMain.handle('auth:loginSuccess') →
  1. Close login window (if exists)
  2. Create main window (createWindow)
  3. Create system tray (if not exists)
  4. Login window = null
```

### 2.6 Electron: `auth:setSession` Handler (`main.ts`)

```
ipcMain.handle('auth:setSession', (_event, session) => {
  authSession = session
})
```

- Stores the session in memory for use by Electron when making API calls (manifest downloads, depot key fetches)

---

## 3. Registration Flow

### 3.1 User Interaction

```
1. User switches to "Register" mode on LoginPage
2. Enters username, email, password, confirm password
3. handleSubmit() →
   useAuthStore.register(email, password, username)
```

### 3.2 API Endpoint (`apps/api/src/routes/auth.ts:38-93`)

```
POST /api/auth/register →
  1. Validate input: zod schema {
       email: string.email,
       password: string.min(8).max(72),
       username: string.min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/)
     }
  2. Check email uniqueness: SELECT from profiles WHERE email = ?
     → If exists: return 409 { error: 'Email already registered' }
  3. Check username uniqueness: SELECT from profiles WHERE username = ?
     → If exists: return 409 { error: 'Username already taken' }
  4. Supabase Auth: signUp(email, password)
     → If error: return 400 { error: errMsg }
  5. Get userId from authData.user.id
  6. Create profile: UPSERT into profiles { id: userId, email, username }
  7. Create refresh token (same as login)
  8. Sign JWT (same as login)
  9. trackEvent({ userId, eventType: 'user_registered' })
  10. Return 201: { access_token, refresh_token, user }
```

### 3.3 Post-Registration

- Same as login: `syncToElectron()` + `loginSuccess()` → main window opens

---

## 4. Token Refresh Flow

### 4.1 Renderer-Initiated Refresh (`src/lib/y-core-api.ts:61-92`)

```
apiFetch() →
  1. Make request with current access token
  2. If 401 response:
     a. refreshAccessToken()
        - POST /api/auth/refresh { refresh_token }
        - Response: { access_token, refresh_token }
        - setToken() → update localStorage + sync to Electron
     b. Retry original request with new token
  3. If refresh fails: clearToken() → throw 'Session expired'
```

**Deduplication**: If multiple requests fail simultaneously, they share the same `refreshPromise` to avoid multiple refresh calls.

### 4.2 Electron-Initiated Refresh (`main.ts:refreshAuthToken()`)

```
refreshAuthToken() →
  1. POST /api/auth/refresh { refresh_token: authSession.refresh_token }
  2. If success:
     a. Update authSession in memory
     b. mainWindow.webContents.send('auth:tokenRefreshed', newSession)
        → Renderer updates localStorage
     c. Return true
  3. If fail: Return false
```

Used by:
- `downloadManifestFromApi()` — when downloading manifests and token is expired
- `fetchDepotKeys()` — when fetching depot keys and token is expired

### 4.3 API Refresh Endpoint (`apps/api/src/routes/auth.ts:139-168`)

```
POST /api/auth/refresh →
  1. Validate: zod { refresh_token: string.uuid }
  2. validateRefreshToken(token):
     a. SHA-256 hash token
     b. SELECT from refresh_tokens WHERE token_hash = ?
     c. Check: not revoked, not expired
     d. Return userId or null
  3. If invalid: return 401 { error: 'Invalid or expired refresh token' }
  4. Fetch profile (email, username)
  5. Revoke old token: UPDATE refresh_tokens SET revoked_at = now()
  6. Create new refresh token (rotation)
  7. Sign new JWT
  8. Return { access_token, refresh_token }
```

**Token rotation**: Each refresh revokes the old token and issues a new one, preventing replay attacks.

---

## 5. Session Persistence

### 5.1 Across App Restarts

```
App startup →
  1. ProtectedRoute.init() →
  2. useAuthStore.init() →
  3. Check localStorage for 'ycore_session':
     → If exists:
        a. Parse JWT payload (base64 decode middle segment)
        b. Extract email, username
        c. Sync to Electron: window.steamtools.setAuthSession()
        d. Set user state
     → If not exists:
        a. Sync null to Electron
        b. Set user: null (shows login window)
```

**Note**: The JWT is NOT verified client-side. If the access token is expired, the first API call will trigger a refresh. If the refresh token is also expired, the user is logged out.

### 5.2 Token Storage Locations

| Location | Content | Lifetime |
|----------|---------|----------|
| `localStorage['ycore_session']` | `{ accessToken, refreshToken }` | Until logout or expiry |
| Electron `authSession` (in-memory) | `{ access_token, refresh_token }` | Until app close or logout |
| `refresh_tokens` table | `{ user_id, token_hash, expires_at, revoked_at }` | 30 days from creation |

---

## 6. Logout Flow

### 6.1 User-Initiated Logout

```
useAuthStore.logout() →
  1. await api.logout()
     → POST /api/auth/logout { refresh_token }
     → API revokes the refresh token
  2. syncToElectron(null)
     → window.steamtools.setAuthSession(null)
  3. await window.steamtools.logout()
     → Electron IPC: auth:logout handler
  4. set({ user: null })
```

### 6.2 Electron: `auth:logout` Handler (`main.ts`)

```
ipcMain.handle('auth:logout') →
  1. authSession = null
  2. Close main window
  3. Create login window
```

### 6.3 API Logout Endpoint (`apps/api/src/routes/auth.ts:271-279`)

```
POST /api/auth/logout (requires JWT auth) →
  1. Extract refresh_token from body
  2. revokeRefreshToken(token):
     → UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = ?
  3. Return 204 (no content)
```

---

## 7. Password Reset Flow

### 7.1 Forgot Password

```
1. User clicks "Forgot password?" on LoginPage
2. Enters email
3. POST /api/auth/forgot-password { email } →
   a. Look up profile by email
   b. If not found: return 200 with generic message (don't reveal)
   c. Cleanup old tokens: cleanup_password_resets() RPC
   d. Generate 6-digit code: Math.floor(100000 + Math.random() * 900000)
   e. Insert into password_resets: { user_id, code, expires_at: now+1h }
   f. Send email via Resend:
      - From: RESEND_FROM_EMAIL
      - To: user email
      - Subject: "Reset your Y-Core password"
      - HTML: 6-digit code displayed prominently
   g. Return 200 { message: 'If this email is registered, a reset code has been sent' }
```

### 7.2 Reset Password

```
1. User enters code + new password on LoginPage (codeSent mode)
2. POST /api/auth/reset-password { code, password } →
   a. Validate: zod { code: string.min(6).max(8), password: string.min(8).max(72) }
   b. SELECT from password_resets WHERE code = ?
   c. Check: not used, not expired
   d. Update password via Supabase admin: updateUserById(user_id, { password })
   e. Mark code as used: UPDATE password_resets SET used_at = now()
   f. Return 200 { message: 'Password reset successfully' }
```

---

## 8. Auth-Related IPC Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `auth:setSession` | Renderer → Main | `{ access_token, refresh_token } \| null` | Store session in main process |
| `auth:loginSuccess` | Renderer → Main | — | Trigger main window creation after login |
| `auth:logout` | Renderer → Main | — | Clear session, show login window |
| `auth:tokenRefreshed` | Main → Renderer | `{ access_token, refresh_token }` | Notify renderer of refreshed tokens |

---

## 9. Security Considerations

| Aspect | Implementation | Risk |
|--------|---------------|------|
| Password storage | Supabase Auth (bcrypt) | ✅ Industry standard |
| JWT signing | HMAC-SHA256 with `JWT_SECRET` | ⚠️ No key rotation mechanism |
| Refresh token storage | SHA-256 hashed in DB | ✅ Tokens not stored in plaintext |
| Refresh token rotation | Old token revoked on each refresh | ✅ Prevents replay |
| Refresh token expiry | 30 days | ⚠️ Long-lived; consider shorter for sensitive ops |
| Token in localStorage | Vulnerable to XSS | ⚠️ See Security Assessment phase |
| Token in Electron memory | Lost on app close | ✅ Acceptable |
| Password reset codes | 6-digit, 1h expiry, single-use | ⚠️ 10^6 entropy, rate limit needed |
| CORS | Configurable, fails closed in prod | ✅ Secure default |
| Rate limiting | 300 req/min global, 20 installs/10min | ✅ Adequate |

---

## 10. Auth State Diagram

```
                    ┌──────────┐
                    │  No Auth  │
                    │  (Login)  │
                    └─────┬─────┘
                          │
                    Login/Register
                          │
                          ▼
                    ┌──────────┐
          ┌────────│  Authed   │────────┐
          │        └─────┬─────┘        │
          │              │              │
     JWT Expired    Logout         App Restart
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Refresh  │  │  No Auth  │  │ Check LS │
    │  Token    │  │  (Login)  │  │ for Token│
    └─────┬─────┘  └──────────┘  └─────┬─────┘
          │                             │
     Success?                      Found?
      /     \                      /     \
    Yes     No                   Yes     No
     │       │                    │       │
     ▼       ▼                    ▼       ▼
  Authed  No Auth              Authed  No Auth
```

# Y-Core Technical Audit — Phase 07: Game Installation Flow

## Overview

This document traces the complete game installation flow from store click to Steam restart, covering both catalog games (ready) and DepotBox imports (queued).

---

## 1. Installation Entry Point (`StorePage.tsx:503-580`)

### 1.1 `handleInstall(game: MergedGame)`

```
1. setInstalling(game.app_id) — show loading state on card
2. Close Steam:
   window.steamtools.closeSteam()
   → If fails: toast error, return

3. GoldSrc mod check:
   If game.app_id in GOLDSRC_MOD_APP_IDS (10,20,30,40,50,60,80,100,130):
     a. Install Half-Life base (appId '70') first:
        - installGame('70') → API
        - If 'ready': storeInstallGame IPC with base data
        - If 'queued': pollJob for base, then continue
        - If not available: warn user, continue anyway

4. Install main game:
   const resp = await installGame(game.app_id)
   → POST /api/games/{appId}/install

5. Handle response:
   a. If resp.status === 'ready' && resp.game:
      → Direct install via storeInstallGame IPC
   b. If resp.status === 'queued' && resp.job_id:
      → Poll job, then install via storeInstallGame IPC

6. Post-install:
   a. reportDownloaded(appId) → POST /api/games/{appId}/downloaded
   b. consumeGame(appId) — remove from recommendations
   c. showToast('success', '{name} installed')
   d. window.steamtools.restartSteam()

7. setInstalling(null) — clear loading state
```

---

## 2. API Install Endpoint (`games.ts:283-380`)

### 2.1 `POST /api/games/:app_id/install`

```
1. preHandler: fastify.authenticate (JWT required)
2. Rate limit: 20 installs per 10 minutes per user + IP
3. Log request: INSERT into install_requests { user_id, app_id, source, ip_address }
4. Check catalog:
   SELECT * FROM games WHERE app_id = {appId}
5. Decision:
   a. Game exists AND has lua_path AND has manifests:
      → Fetch lua_content from GitHub (lua/{appId}.lua)
      → Fetch manifest_files from DB
      → Fetch depot_keys from DB
      → Return { status: 'ready', game: { app_id, name, lua_content, manifest_files, depot_keys } }

   b. Game exists but missing data OR game doesn't exist:
      → Create import job
      → processDepotBoxImport(jobId, appId) — async, inline processing
      → Return { status: 'queued', job_id }
```

### 2.2 Ready Response Data

```typescript
{
  status: 'ready',
  game: {
    app_id: string,
    name: string,
    lua_path: string,
    lua_content: string,    // Full Lua script content from GitHub
    manifest_files: [{
      depot_id: string,
      manifest_gid: string,
      file_name: string,
      file_size: number
    }],
    depot_keys: [{
      depot_id: string,
      decryption_key: string
    }]
  }
}
```

---

## 3. `storeInstallGame` IPC Handler (`main.ts:~1740-1900`)

This is the core Electron-side installation function.

### 3.1 Flow

```
store:installGame({ app_id, name, lua_content, manifest_files, depot_keys }) →
  1. Get Steam path and Lua scripts directory
  2. Determine Lua target directory:
     - If YCoreTool.dll exists: config/lua/
     - Else: config/stplug-in/

  3. GoldSrc base depot handling:
     If appId in GOLDSRC_MOD_APP_IDS:
       a. ensureGoldSrcBaseDepots(appId, luaContent, existingDepotKeys)
          → Reads base depot keys + manifests from existing Lua files
          → Appends missing base depots to Lua content
       b. createGoldSrcBaseAppManifest(luaContent, depotIdsWithKeys)
          → Creates appmanifest_70.acf for Half-Life base

  4. Write Lua script:
     a. Write lua_content to {luaDir}/{appId}.lua
     b. Log action

  5. Process depot keys:
     a. If depot_keys provided: use them
     b. If depot_keys empty: fetch from API
        → GET /api/games/{appId}/depot-keys (with JWT)
        → If 401: refresh token and retry
     c. injectDepotKeysIntoConfigVdf(depotKeys)
        → Backup config.vdf
        → Insert/update DecryptionKey entries in depots section

  6. Download and place manifest files:
     For each manifest_file:
       a. Check if already in depotcache:
          {steamPath}/depotcache/{depotId}_{manifestGid}.manifest
       b. If not in depotcache:
          - Download from API: GET /api/manifests/{appId}/{depotId}/{manifestGid}
            (with JWT auth, token refresh on 401)
          - Save to depotcache
       c. Log action

  7. Create ACF manifest:
     a. createAppManifestFromLua(appId, luaContent, gameName, depotIdsWithKeys)
        → Parse Lua for manifest entries
        → Build ACF content with StateFlags '1026' (update required)
        → Write to {steamAppsPath}/appmanifest_{appId}.acf

  8. Invalidate games cache: _gamesCache = null

  9. Return:
     {
       success: boolean,
       actions: string[],    // Info messages
       errors: string[],     // Error messages
       error?: string        // First error
     }
```

### 3.2 Depot Key Injection (`depot-keys.ts`)

```
injectDepotKeysIntoConfigVdf(depotKeys) →
  1. Read config.vdf
  2. Find existing depot keys (regex scan)
  3. Find or create "depots" section inside "Steam" section
  4. For each depot key:
     a. If depot doesn't exist: insert new entry
     b. If depot exists: update key value
  5. Backup config.vdf → config.vdf.bak
  6. Write updated config.vdf
  7. Return { success, added: count }
```

### 3.3 Manifest Download (`main.ts:downloadManifestFromApi`)

```
downloadManifestFromApi(appId, depotId, manifestGid) →
  1. Construct URL: {apiUrl}/api/manifests/{appId}/{depotId}/{manifestGid}
  2. Fetch with Authorization header (JWT from authSession)
  3. If 401:
     a. refreshAuthToken() — refresh JWT via API
     b. Retry fetch with new token
  4. If success: return Buffer
  5. If failure: throw error
```

---

## 4. Depot Keys API Endpoint (`games.ts:582-640`)

### 4.1 `GET /api/games/:app_id/depot-keys`

```
1. preHandler: fastify.authenticate (JWT required)
2. Verify install request exists:
   SELECT from install_requests
   WHERE user_id = {userId} AND app_id = {appId}
   ORDER BY created_at DESC LIMIT 1
3. If no install request: return 403 { error: 'No install request found' }
4. Fetch depot keys:
   SELECT depot_id, decryption_key FROM game_depot_keys WHERE app_id = {appId}
5. Return [{ depot_id, decryption_key }]
```

**Security**: Depot keys are only returned to users who have an active install request for that game. This prevents unauthorized key retrieval.

---

## 5. Manifest Download API Endpoint (`manifests.ts:6-53`)

### 5.1 `GET /api/manifests/:app_id/:depot_id/:manifest_gid`

```
1. preHandler: fastify.authenticate (JWT required)
2. Verify manifest exists in DB:
   SELECT file_name FROM manifests
   WHERE app_id = {appId} AND depot_id = {depotId} AND manifest_gid = {manifestGid}
3. If not found: return 404
4. Fetch from GitHub:
   GET https://raw.githubusercontent.com/{repo}/main/manifests/{appId}/{depotId}_{manifestGid}.manifest
   Headers: Authorization (if GITHUB_TOKEN set), Accept: raw
5. If not found: return 404
6. Return as binary:
   Content-Type: application/octet-stream
   Content-Disposition: attachment; filename="{file_name}"
```

---

## 6. GoldSrc Mod Installation

### 6.1 Special Handling

GoldSrc mods (CS, TFC, DoD, etc.) require Half-Life base engine depots.

```
GOLDSRC_MOD_APP_IDS = { 10, 20, 30, 40, 50, 60, 80, 100, 130 }
GOLDSRC_BASE_DEPOT_IDS = [1, 2, 3, 8, 9, 96, 228988]
```

### 6.2 Base Depot Flow

```
1. Install Half-Life (appId 70) first:
   → installGame('70')
   → storeInstallGame with base data

2. ensureGoldSrcBaseDepots(appId, luaContent, existingKeys):
   a. Check if Lua is missing base depot IDs
   b. Read base depots from existing Lua files (130.lua, 70.lua, 50.lua, etc.)
   c. Append missing addappid() and setManifestid() lines to Lua
   d. Return updated Lua + added keys + added manifests

3. createGoldSrcBaseAppManifest(luaContent, depotIdsWithKeys):
   a. Parse Lua for base depot manifest entries
   b. Build ACF for appId 70 (Half-Life)
   c. Write appmanifest_70.acf
```

### 6.3 ACF for GoldSrc Mods

```
createAppManifestFromLua for GoldSrc mod:
  1. installDir = 'Half-Life' (not game name)
  2. Shared depots: base depot IDs → parent app '70'
  3. Only include mod-specific depots (not base depots)
```

---

## 7. Post-Install Actions

### 7.1 Report Downloaded

```
POST /api/games/{appId}/downloaded →
  1. Call RPC: increment_download_count(appId)
     → UPDATE games SET download_count = download_count + 1
  2. Return 204
```

### 7.2 Restart Steam

```
window.steamtools.restartSteam() →
  IPC: steam:restartSteam →
    1. Close Steam process (taskkill /IM steam.exe /F)
    2. Wait for Steam to close (max 15 seconds)
    3. Start Steam: spawn(steamExe, ['-silent'], { detached: true })
    4. Return { success: true }
```

### 7.3 Cache Invalidation

- `_gamesCache = null` — forces library to re-scan on next visit
- `gamesCacheRef.current = null` (renderer) — forces store to re-fetch catalog

---

## 8. Installation Flow Diagram

```
User clicks "Install"
       │
       ▼
  Close Steam (taskkill)
       │
       ▼
  GoldSrc mod? ──Yes──▶ Install Half-Life base (70) first
       │ No                    │
       │                       ▼
       │                 Continue with mod
       │
       ▼
  POST /api/games/{appId}/install
       │
       ├── Ready? ──────────────────────────────┐
       │                                         │
       │ No (queued)                             │
       │                                         │
       ▼                                         │
  Poll job (every 3s, max 10 min)                │
       │                                         │
       ▼                                         │
  Job completed                                  │
       │                                         │
       └─────────────────────────────────────────┘
                         │
                         ▼
  storeInstallGame IPC (Electron main)
       │
       ├── Write Lua script to config/lua/ or stplug-in/
       ├── Fetch + inject depot keys into config.vdf
       ├── Download manifest files from GitHub → depotcache/
       └── Create appmanifest_{appId}.acf
                         │
                         ▼
  POST /api/games/{appId}/downloaded (increment count)
       │
       ▼
  Restart Steam (close + start -silent)
       │
       ▼
  Steam detects new ACF → downloads game content
       │
       ▼
  Game appears in Steam library
```

---

## 9. Installation Error Handling

| Scenario | Handling |
|----------|----------|
| Steam won't close | Toast error, installation aborted |
| API install fails | Toast error with API message |
| Job polling timeout | Toast: "Import timed out after 10 minutes" |
| Job fails | Toast with job.error_message |
| Lua write fails | Error in storeInstallGame result |
| Depot key injection fails | Error logged, installation continues |
| Manifest download fails | Error in storeInstallGame result, game may not work |
| ACF creation fails | Error in storeInstallGame result |
| Steam restart fails | Silent, user can restart manually |
| GoldSrc base not available | Warning toast, mod install continues |

---

## 10. Installation File Changes Summary

| File | Action | Location |
|------|--------|----------|
| `{appId}.lua` | Created/overwritten | `{steamPath}/config/lua/` or `config/stplug-in/` |
| `config.vdf` | Modified (depot keys added) | `{steamPath}/config/` |
| `config.vdf.bak` | Created (backup) | `{steamPath}/config/` |
| `{depotId}_{manifestGid}.manifest` | Downloaded | `{steamPath}/depotcache/` |
| `appmanifest_{appId}.acf` | Created | `{steamPath}/steamapps/` |
| `appmanifest_70.acf` | Created (GoldSrc only) | `{steamPath}/steamapps/` |

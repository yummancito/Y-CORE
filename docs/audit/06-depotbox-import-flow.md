# Y-Core Technical Audit — Phase 06: DepotBox Import Flow

## Overview

This document traces the DepotBox import flow: how games not in the Y-Core catalog are imported from DepotBox, processed on the server, and made available for installation.

---

## 1. DepotBox Integration Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│  Renderer   │────▶│  Y-Core API  │────▶│  DepotBox    │────▶│  GitHub    │
│  (StorePage)│     │  (Fastify)   │     │  API         │     │  Repo      │
└─────────────┘     └──────────────┘     └──────────────┘     └────────────┘
                           │
                           ▼
                     ┌──────────────┐
                     │  Supabase    │
                     │  (import_jobs│
                     │   games,     │
                     │   manifests, │
                     │   depot_keys)│
                     └──────────────┘
```

**DepotBox** (`https://depotbox.org`) is an external service that provides:
- Game search
- Game download (ZIP files containing Lua scripts + manifest files)
- Download status polling

---

## 2. Import Trigger

### 2.1 When Import is Needed

When a user clicks "Install" on a DepotBox-sourced game in the store:

```
handleInstall(game) →
  1. const resp = await installGame(game.app_id)
  2. If resp.status === 'ready' && resp.game:
     → Game already in catalog with all data: install directly
  3. If resp.status === 'queued' && resp.job_id:
     → Game needs DepotBox import: poll job until complete
```

### 2.2 API: Install Endpoint Decision (`games.ts:283-380`)

```
POST /api/games/:app_id/install →
  1. Authenticate user (JWT required)
  2. Rate limit check: 20 installs per 10 minutes per user+IP
  3. Log install request to install_requests table
  4. Check if game exists in catalog (games table):
     a. If exists AND has lua_path AND has manifests:
        → Return { status: 'ready', game: { lua_content, manifest_files, depot_keys } }
     b. If exists but missing data:
        → Create import job, return { status: 'queued', job_id }
     c. If not exists:
        → Create import job, return { status: 'queued', job_id }
```

---

## 3. Import Job Creation (`games.ts:382-420`)

```
createImportJob(appId, userId) →
  1. Insert into import_jobs:
     { app_id, user_id, status: 'queued', attempts: 0 }
  2. Return job.id
```

### 3.1 Import Job States

```
queued → processing → completed
                    └→ failed
```

| State | Meaning |
|-------|---------|
| `queued` | Job created, waiting for processing |
| `processing` | DepotBox download started, extracting data |
| `completed` | Import done, game data available |
| `failed` | Import failed, error_message set |

---

## 4. `processDepotBoxImport` Function (`games.ts:422-580`)

This is the core import logic, called when a job is processed.

### 4.1 Flow

```
processDepotBoxImport(jobId, appId) →
  1. Update job status: 'processing', started_at = now()
  2. Update heartbeat: heartbeat_at = now()

  3. Initiate DepotBox download:
     a. initiateDownload(appId) → POST https://depotbox.org/api/download { appid }
        → Returns token
     b. waitForDownloadReady(token, maxPolls=60, intervalMs=3000)
        → Polls GET /api/status/{token} every 3 seconds
        → Returns downloadLink when status === 'completed'
        → Throws if status === 'failed' or timeout (3 minutes)

  4. Download ZIP:
     a. downloadZip(downloadLink) → fetch with X-API-Key header
        → Returns Buffer

  5. Extract ZIP contents:
     a. extractZip(zipBuffer) using unzipper
        → Returns { luaFiles, manifestFiles }

  6. Parse Lua script:
     a. findMainLua(luaFiles, appId) → find the Lua file containing addappid({appId}
     b. parseLuaScript(content) → extract appIds, manifestIds, depot keys

  7. Fetch Steam app details:
     a. fetchSteamAppDetails(appId) → Steam Store API
        → Returns name, description, header_image, developer, etc.

  8. Upsert game in database:
     a. UPSERT into games:
        { app_id, name, description, header_image_url, developer, publisher,
          release_date, lua_path: 'lua/{appId}.lua', source: 'depotbox',
          depotbox_imported_at: now(), is_available: true }

  9. Store manifest metadata:
     a. For each manifest file:
        UPSERT into manifests:
        { app_id, depot_id, manifest_gid, file_name, file_size }

  10. Upload files to GitHub:
      a. uploadLuaFile(appId, luaContent) → PUT to repo contents API
         Path: lua/{appId}.lua
      b. For each manifest file:
         uploadManifestFile(appId, depotId, manifestGid, buffer)
         Path: manifests/{appId}/{depotId}_{manifestGid}.manifest

  11. Store depot keys:
      a. For each parsed appId with a key:
         UPSERT into game_depot_keys:
         { app_id, depot_id: appId, decryption_key: key }

  12. Update job result:
      a. UPDATE import_jobs SET:
         status: 'completed',
         result: { app_id, name, lua_path, lua_content, manifest_files, depot_keys }

  13. Track telemetry:
      trackDepotBoxImportCompleted(appId)

  14. Return result
```

### 4.2 Error Handling

```
On any error during processing:
  1. UPDATE import_jobs SET:
     status: 'failed',
     error_message: err.message,
     attempts: attempts + 1
  2. trackDepotBoxImportFailed(appId, error)
  3. Throw error (caller handles)
```

---

## 5. Job Polling (Client-Side)

### 5.1 `pollJob` Function (`StorePage.tsx:582-631`)

```
pollJob(jobId, appId, gameName?) →
  1. setImportProgress({ appId, status: 'queued' })
  2. showToast('info', 'Importing... This may take a minute...')
  3. Loop (max 200 attempts, 3s interval = 10 min timeout):
     a. job = await getJobStatus(jobId)
        → GET /api/jobs/{jobId}
     b. If job.status === 'completed' && job.result:
        → Install game via storeInstallGame IPC
        → reportDownloaded(appId)
        → showToast('success', '{name} installed')
        → restartSteam()
        → Return
     c. If job.status === 'failed':
        → showToast('error', job.error_message)
        → Return
     d. setImportProgress({ appId, status: job.status })
  4. Timeout: showToast('error', 'Import timed out after 10 minutes')
```

### 5.2 API: Job Status Endpoint (`jobs.ts:6-44`)

```
GET /api/jobs/:job_id (requires JWT auth) →
  1. SELECT from import_jobs WHERE id = {job_id} AND user_id = {req.user.userId}
  2. If not found: return 404
  3. Strip depot keys from result (security):
     result.result.depot_keys = [] (always empty in job response)
  4. Return:
     { id, app_id, status, attempts, error_message, result, created_at, updated_at }
```

**Important**: Depot keys are NOT returned in the job result. They must be fetched separately via the depot-keys endpoint during installation.

---

## 6. Post-Import Installation

### 6.1 After Job Completes

```
job.result contains:
  {
    app_id, name, lua_path, lua_content,
    manifest_files: [{ depot_id, manifest_gid, file_name, file_size }],
    depot_keys: []  // ALWAYS EMPTY - stripped for security
  }

→ window.steamtools.storeInstallGame({
    app_id: job.result.app_id,
    name: job.result.name,
    lua_content: job.result.lua_content,
    manifest_files: job.result.manifest_files.map(...),
    depot_keys: []  // No keys from job
  })
```

### 6.2 Depot Keys Fetched Separately

During `storeInstallGame` IPC handler, depot keys are fetched:

```
storeInstallGame handler →
  1. If depot_keys is empty:
     a. Fetch from API: GET /api/games/{app_id}/depot-keys
        → Requires JWT auth
        → Returns [{ depot_id, decryption_key }]
     b. Inject keys into config.vdf
  2. Write Lua script
  3. Download and place manifest files
  4. Create ACF manifest
  5. Return result
```

---

## 7. DepotBox API Client (`apps/api/src/lib/depotbox.ts`)

### 7.1 Endpoints Used

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/download` | Initiate game download, get token |
| GET | `/api/status/{token}` | Poll download status |
| GET | `{downloadLink}` | Download ZIP file |
| POST | `/api/search-games` | Search DepotBox catalog |

### 7.2 Authentication

All DepotBox API calls use `X-API-Key` header with `DEPOTBOX_API_KEY` environment variable.

### 7.3 Download Flow

```
initiateDownload(appId) →
  POST /api/download { appid: appId }
  → Returns { status: 'processing', token }

waitForDownloadReady(token) →
  Loop (max 60 polls, 3s interval = 3 min timeout):
    GET /api/status/{token}
    → If status === 'completed': return downloadLink
    → If status === 'failed'/'error': throw
  → Timeout: throw 'Depotbox download timed out'

downloadZip(downloadLink) →
  GET {downloadLink} with X-API-Key header
  → Returns Buffer
```

---

## 8. GitHub Storage (`apps/api/src/lib/github.ts`)

### 8.1 Upload Flow

```
uploadFileToRepo(path, content, message) →
  1. Check if file exists: GET /repos/{repo}/contents/{path}
     → If exists: get SHA for update
  2. PUT /repos/{repo}/contents/{path}
     Body: { message, content: base64, sha? }
  3. Return on success, throw on failure
```

### 8.2 File Paths

| Type | Path in Repo |
|------|-------------|
| Lua script | `lua/{appId}.lua` |
| Manifest | `manifests/{appId}/{depotId}_{manifestGid}.manifest` |

### 8.3 Repo Configuration

- Default repo: `yummancito/y-core-manifests`
- Configurable via `GITHUB_MANIFESTS_REPO` env var
- Auth: `GITHUB_TOKEN` (personal access token)

---

## 9. Import Data Flow Diagram

```
User clicks "Install" (DepotBox game)
       │
       ▼
  POST /api/games/{appId}/install
       │
       ├── Game in catalog with data? ──Yes──▶ Return { status: 'ready', game }
       │
       No
       │
       ▼
  Create import_job (status: 'queued')
       │
       ▼
  Return { status: 'queued', job_id }
       │
       ▼
  Client polls GET /api/jobs/{job_id} (every 3s)
       │
       ▼
  Server processes job:
       │
  ┌────┴────────────────────────────────────────┐
  │ 1. DepotBox: initiate download               │
  │ 2. DepotBox: poll until ready (max 3 min)    │
  │ 3. DepotBox: download ZIP                    │
  │ 4. Extract Lua + manifest files from ZIP     │
  │ 5. Parse Lua for depot keys + manifest IDs   │
  │ 6. Fetch Steam app details                   │
  │ 7. UPSERT game in Supabase                   │
  │ 8. UPSERT manifests in Supabase              │
  │ 9. Upload Lua + manifests to GitHub          │
  │ 10. UPSERT depot keys in Supabase            │
  │ 11. Update job: status='completed'           │
  └─────────────────────────────────────────────┘
       │
       ▼
  Client receives completed job
       │
       ▼
  storeInstallGame IPC (Electron)
       │
       ├── Write Lua script to Steam config
       ├── Download manifests from GitHub
       ├── Create ACF manifest
       ├── Fetch + inject depot keys into config.vdf
       └── Restart Steam
```

---

## 10. Error Scenarios

| Scenario | Handling |
|----------|----------|
| DepotBox API key not set | `initiateDownload()` throws, job fails |
| DepotBox download timeout | Job fails with 'Depotbox download timed out' |
| ZIP extraction fails | Job fails with extraction error |
| No Lua files in ZIP | Job fails with 'No Lua files found' |
| Steam API unavailable | Game name falls back to `App {appId}` |
| GitHub upload fails | Job fails with upload error |
| Supabase write fails | Job fails with DB error |
| Client polling timeout | 10 min timeout, toast error shown |
| Job not found for user | 404 from API |

# Y-Core Technical Audit — Phase 09: IPC Channel Map

## Overview

Complete map of all Electron IPC channels between the renderer process (via `window.steamtools`) and the main process.

---

## 1. IPC Channel Summary

**Total channels**: 42 (38 invoke + 4 event listeners)

### Channel Types

| Type | Count | Description |
|------|-------|-------------|
| `ipcRenderer.invoke` | 38 | Request-response (renderer → main) |
| `ipcRenderer.on` | 4 | Event listeners (main → renderer) |

---

## 2. Complete Channel Inventory

### 2.1 App Lifecycle (5 channels)

| # | Channel | Method | Payload | Returns | Handler Location |
|---|---------|--------|---------|---------|-----------------|
| 1 | `app:ready` | invoke | — | — | `main.ts` |
| 2 | `splash:setStatus` | invoke | `{ status, percent }` | — | `main.ts` |
| 3 | `app:getLocale` | invoke | — | `string` (locale) | `main.ts` |
| 4 | `app:openExternal` | invoke | `string` (url) | — | `main.ts` |
| 5 | `app:installUpdate` | invoke | — | — | `main.ts` |

### 2.2 Authentication (4 channels + 1 event)

| # | Channel | Method | Payload | Returns | Purpose |
|---|---------|--------|---------|---------|---------|
| 6 | `auth:setSession` | invoke | `{ access_token, refresh_token } \| null` | — | Store session in main |
| 7 | `auth:loginSuccess` | invoke | — | — | Trigger main window creation |
| 8 | `auth:logout` | invoke | — | — | Clear session, show login |
| 9 | `auth:tokenRefreshed` | **event** | `{ access_token, refresh_token }` | — | Notify renderer of refresh |

### 2.3 Steam Directory (2 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 10 | `steam:getPath` | invoke | — | `{ success, path }` |
| 11 | `steam:getLibraryFolders` | invoke | — | `{ success, folders }` |

### 2.4 Game Actions (6 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 12 | `steam:listInstalledGames` | invoke | — | `{ success, games[] }` |
| 13 | `steam:launchGame` | invoke | `appId` | `{ success }` |
| 14 | `steam:uninstallGame` | invoke | `appId` | `{ success }` |
| 15 | `steam:deleteGame` | invoke | `appId, installDir` | `{ success }` |
| 16 | `library:openLocation` | invoke | `appId, installDir` | `{ success }` |
| 17 | `library:verifyGame` | invoke | `appId` | `{ success }` |

### 2.5 Store Images (1 channel)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 18 | `steam:getStoreImage` | invoke | `appId, steamGridDbApiKey?` | `{ success, imageUrl }` |

### 2.6 Manifest Files (3 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 19 | `steam:importManifest` | invoke | `{ manifestPath }` | `{ success }` |
| 20 | `steam:listManifestFiles` | invoke | — | `{ success, files[] }` |
| 21 | `steam:deleteManifestFile` | invoke | `fileName` | `{ success }` |

### 2.7 Lua Scripts (4 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 22 | `steam:listLuaScripts` | invoke | — | `{ success, scripts[] }` |
| 23 | `steam:parseLuaScript` | invoke | `{ luaPath }` | `{ success, parsed }` |
| 24 | `steam:importLuaScript` | invoke | `{ luaPath }` | `{ success }` |
| 25 | `steam:deleteLuaScript` | invoke | `fileName` | `{ success }` |

### 2.8 Steam Process (3 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 26 | `steam:restartSteam` | invoke | — | `{ success }` |
| 27 | `steam:closeSteam` | invoke | — | `{ success }` |
| 28 | `steam:isRunning` | invoke | — | `{ running }` |

### 2.9 Search & App Type (3 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 29 | `steam:searchGames` | invoke | `query` | `{ success, games[] }` |
| 30 | `steam:isFreeToPlay` | invoke | `appId` | `{ isF2P }` |
| 31 | `steam:checkAppTypes` | invoke | `appIds[]` | `Record<appId, { isGame, isAdult }>` |

### 2.10 Game Import (1 channel)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 32 | `steam:importGameFolder` | invoke | `{ folderPath }` | `{ success, importedGames[] }` |

### 2.11 Logs (6 channels + 1 event)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 33 | `logs:getEntries` | invoke | `{ level?, search?, limit? }` | `LogEntry[]` |
| 34 | `logs:add` | invoke | `{ level?, message }` | — |
| 35 | `logs:clear` | invoke | — | — |
| 36 | `logs:export` | invoke | — | `{ success, path }` |
| 37 | `logs:getConfig` | invoke | — | `LogConfig` |
| 38 | `logs:setConfig` | invoke | `Partial<LogConfig>` | `LogConfig` |
| 39 | `log:entry` | **event** | `LogEntry` | — |

### 2.12 Store Operations (3 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 40 | `store:installGame` | invoke | `{ app_id, name, lua_content, manifest_files[], depot_keys[] }` | `{ success, actions[], errors[] }` |
| 41 | `store:getLocalGameData` | invoke | `appId` | `{ success, game }` |
| 42 | `store:getLocalAppIds` | invoke | — | `{ success, appIds[] }` |

### 2.13 DepotBox (2 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 43 | `depotbox:search` | invoke | `apiKey, searchTerm, options?` | `{ success, games[] }` |
| 44 | `depotbox:install` | invoke | `{ appId, name?, apiKey }` | `{ success }` |

### 2.14 Config (2 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 45 | `config:read` | invoke | — | `object \| null` |
| 46 | `config:write` | invoke | `object` | `{ success }` |

### 2.15 OnlineFix (3 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 47 | `onlinefix:enable` | invoke | `{ appId }` | `{ success, launchOptions }` |
| 48 | `onlinefix:disable` | invoke | `{ appId }` | `{ success, launchOptions }` |
| 49 | `onlinefix:status` | invoke | `{ appId }` | `{ enabled, launchOptions }` |

### 2.16 Window Controls (3 channels)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 50 | `window-minimize` | invoke | — | — |
| 51 | `window-maximize` | invoke | — | — |
| 52 | `window-close` | invoke | — | — |

### 2.17 Auto-Updater (1 channel + 2 events)

| # | Channel | Method | Payload | Returns |
|---|---------|--------|---------|---------|
| 53 | `app:installUpdate` | invoke | — | — |
| 54 | `update-available` | **event** | `{ version? }` | — |
| 55 | `update-downloaded` | **event** | `{ version? }` | — |

### 2.18 File Path (1 utility)

| # | API | Method | Payload | Returns |
|---|-----|--------|---------|---------|
| 56 | `getPathForFile` | webUtils | `File` | `string` (path) |

**Note**: This is NOT an IPC call — it uses Electron's `webUtils.getPathForFile()` for drag & drop file path resolution with context isolation.

---

## 3. Event Listeners (Main → Renderer)

| Event | Payload | Trigger |
|-------|---------|---------|
| `auth:tokenRefreshed` | `{ access_token, refresh_token }` | Electron refreshes token for manifest download |
| `log:entry` | `LogEntry` | Any log message written by main process |
| `update-available` | `{ version? }` | Auto-updater detects new version |
| `update-downloaded` | `{ version? }` | Auto-updater finishes downloading update |

---

## 4. IPC Handler Registration Locations

| Module | File | Channels |
|--------|------|----------|
| Main process | `electron/main.ts` | App lifecycle, auth, Steam, game actions, manifests, Lua, store, DepotBox, search, window, updater |
| Config | `electron/modules/config.ts` | `config:read`, `config:write` |
| OnlineFix | `electron/modules/onlinefix.ts` | `onlinefix:enable`, `onlinefix:disable`, `onlinefix:status` |
| Logs | `electron/modules/logs.ts` | `logs:getEntries`, `logs:add`, `logs:clear`, `logs:export`, `logs:getConfig`, `logs:setConfig` |

---

## 5. Preload API Surface (`window.steamtools`)

The preload script (`electron/preload.ts`) exposes a single `steamtools` object on `window`. All methods are either:
- `ipcRenderer.invoke()` — for request-response
- `ipcRenderer.on()` — for event subscriptions (returns unsubscribe function)
- `webUtils.getPathForFile()` — for file path resolution

### Security

- **contextIsolation**: `true` — renderer cannot access Node.js APIs directly
- **nodeIntegration**: `false` — no Node.js in renderer
- **sandbox**: Not explicitly set (default: false in Electron)
- All communication goes through the `contextBridge`

---

## 6. IPC Error Handling Patterns

Most IPC handlers follow this pattern:

```typescript
ipcMain.handle('channel', async (_event, ...args) => {
  try {
    // Validate inputs
    // Perform operation
    return { success: true, data }
  } catch (err: any) {
    logger.error(`[channel] ${err.message}`, 'source')
    return { success: false, error: err.message }
  }
})
```

**Notable**: Errors are returned as part of the response object, not thrown. The renderer checks `result.success` and displays `result.error` if present.

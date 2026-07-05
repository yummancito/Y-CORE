# Y-Core Technical Audit — Phase 04: Library Flow

## Overview

This document traces the library page flow: how installed games are discovered, displayed, sorted, searched, and managed.

---

## 1. Library Page Entry (`src/pages/LibraryPage.tsx`)

### 1.1 Component Mount

```
LibraryPage mounts →
  1. useLibraryStore.loadGames()
  2. useSteamStore.init() (if not already initialized)
  3. useSettingsStore.loadFromConfig()
  4. usePageHeader() — set page title in AppShell
```

### 1.2 Store Initialization

**`useLibraryStore`** (`src/stores/useLibraryStore.ts`):
```
loadGames() →
  1. set({ loading: true, error: null })
  2. const result = await window.steamtools.listInstalledGames()
  3. If result.success:
     a. Filter out app_id '228980' (Steamworks Common Redistributables)
     b. set({ games: filtered, loading: false })
  4. If error:
     set({ error: result.error, loading: false })
```

**`useSteamStore`** (`src/stores/useSteamStore.ts`):
```
init() →
  1. set({ loading: true })
  2. Parallel:
     a. loadSteamPath() → window.steamtools.getSteamPath()
     b. loadSteamRunning() → window.steamtools.isSteamRunning()
     c. loadLibraryFolders() → window.steamtools.getLibraryFolders()
  3. set({ loading: false })
```

---

## 2. Game Discovery: `steam:listInstalledGames` IPC

### 2.1 IPC Handler (`electron/main.ts:~1115`)

```
ipcMain.handle('steam:listInstalledGames') →
  1. Check _gamesCache (in-memory cache)
     → If cached and fresh: return cached result
  2. Get Steam path via getSteamPath()
     → If not found: return { success: false, error: 'Steam not found' }
  3. Get Steam library folders via getSteamLibraryFolders()
     → Reads libraryfolders.vdf
     → Returns array of steamapps paths
  4. For each library folder:
     a. Read all files matching appmanifest_*.acf
     b. For each ACF file:
        - Parse VDF content
        - Extract: appid, name, installdir, universe, stateFlags,
          sizeOnDisk, lastUpdated, lastPlayed, buildid,
          bytesToDownload, bytesDownloaded, autoUpdateBehavior
        - Find manifest file name (if exists in depotcache)
        - Construct InstalledGame object
  5. Cache result in _gamesCache
  6. Return { success: true, games: [...] }
```

### 2.2 ACF Parsing

The `parseVdf()` function in `steam-helpers.ts` is used:
```
parseVdf(content) →
  1. Tokenize: split by quotes and braces
  2. Recursive parse: key-value pairs and nested objects
  3. Return Record<string, any>
```

Example ACF structure parsed:
```
"AppState"
{
  "appid"      "123456"
  "name"       "Game Name"
  "installdir" "Game Name"
  "StateFlags" "4"
  "SizeOnDisk" "12345678"
  ...
}
```

### 2.3 Installed Game Data Model

```typescript
interface InstalledGame {
  appId: string
  name: string
  installDir: string
  universe: string
  stateFlags: string
  sizeOnDisk: number
  lastUpdated: number    // Unix timestamp
  lastPlayed: number     // Unix timestamp
  installedAt: number    // Unix timestamp
  buildid: string
  bytesToDownload: number
  bytesDownloaded: number
  autoUpdateBehavior: string
  manifestFile: string
}
```

---

## 3. Library Display & Filtering

### 3.1 Filtering (`useFilteredLibraryGames` hook)

```
useFilteredLibraryGames() →
  1. Get { games, searchQuery, sortBy } from useLibraryStore
  2. Filter by search query:
     - g.name.toLowerCase().includes(searchQuery.toLowerCase())
     - OR g.appId.includes(searchQuery)
  3. Sort by selected option:
     - nameAsc: a.name.localeCompare(b.name)
     - nameDesc: b.name.localeCompare(a.name)
     - recentlyPlayed: b.lastPlayed - a.lastPlayed
     - recentlyInstalled: b.installedAt - a.installedAt
     - largest: b.sizeOnDisk - a.sizeOnDisk
  4. Return filtered + sorted array
```

### 3.2 Game Card Display

Each game shows:
- Cover image (via `window.steamtools.getStoreImage(appId)`)
- Game name
- Size on disk (formatted)
- Last played date
- Context menu actions

### 3.3 Store Image Fetching: `steam:getStoreImage` IPC

```
steam:getStoreImage(appId, steamGridDbApiKey?) →
  1. Validate appId (must be numeric)
  2. Check storeImageCache (in-memory Map)
     → If cached: return cached result
  3. Try browse image URL (Steam CDN browse page)
  4. Try SteamGridDB API (if API key provided)
  5. Try Steam Store API (appdetails endpoint)
  6. Try HTML scraping of Steam store page
  7. Cache result (even failures) and return
```

**Fallback chain**: CDN → SteamGridDB → Store API → HTML scrape → No image

---

## 4. Library Actions

### 4.1 Launch Game

```
User clicks "Play" →
  window.steamtools.launchGame(appId) →
  IPC: steam:launchGame →
    1. Get Steam path
    2. spawn(steamExe, ['-applaunch', appId], { detached: true })
    3. Return { success: true }
```

### 4.2 Uninstall Game

```
User clicks "Uninstall" →
  window.steamtools.uninstallGame(appId) →
  IPC: steam:uninstallGame →
    1. Get Steam path
    2. spawn(steamExe, ['steam://uninstall/' + appId])
    3. Return { success: true }
```

### 4.3 Delete Game (Force Remove)

```
User clicks "Delete" →
  window.steamtools.deleteGame(appId, installDir) →
  IPC: steam:deleteGame →
    1. Delete ACF file: appmanifest_{appId}.acf
    2. Remove from libraryfolders.vdf
    3. Delete install directory (if exists)
    4. Delete Lua script (if exists)
    5. Invalidate _gamesCache
    6. Return { success: true }
```

### 4.4 Open Game Location

```
User clicks "Open Location" →
  window.steamtools.openGameLocation(appId, installDir) →
  IPC: library:openLocation →
    1. Find game install directory across library folders
    2. shell.openPath(installPath)
    3. Return { success: true }
```

### 4.5 Verify Game

```
User clicks "Verify" →
  window.steamtools.verifyGame(appId) →
  IPC: library:verifyGame →
    1. spawn(steamExe, ['steam://validate/' + appId])
    2. Return { success: true }
```

---

## 5. ACF Watcher (`startAcfWatcher`)

```
startAcfWatcher() →
  1. Set interval (every 30 seconds)
  2. For each ACF file in steamapps:
     a. Read content
     b. Check shouldRepairAcf():
        - StateFlags == 4 or 36 (needs update)
        - SizeOnDisk == 0
        - Has InstalledDepots
     c. If repair needed:
        - patchAcfForDownload() — set StateFlags to 1026, reset bytes
        - Write patched ACF
  3. This ensures Steam re-downloads content for games that need it
```

---

## 6. Library Page State

| State | Source | Purpose |
|-------|--------|---------|
| `games` | `useLibraryStore` | Full installed games list |
| `loading` | `useLibraryStore` | Loading indicator |
| `error` | `useLibraryStore` | Error message |
| `searchQuery` | `useLibraryStore` | Search filter text |
| `sortBy` | `useLibraryStore` | Sort option |
| `selectedGame` | `useLibraryStore` | Currently selected game (for context menu) |
| `steamPath` | `useSteamStore` | Steam installation path |
| `steamRunning` | `useSteamStore` | Whether Steam process is running |
| `libraryFolders` | `useSteamStore` | Steam library folder paths |
| `showAdult` | `useSettingsStore` | Show NSFW games |
| `showTools` | `useSettingsStore` | Show tool apps |

---

## 7. Cache Behavior

| Cache | Location | Invalidation |
|-------|----------|-------------|
| `_gamesCache` | Electron main (in-memory) | Set to `null` on game install, delete, or import |
| `storeImageCache` | Electron main (in-memory Map) | Never invalidated (per app session) |
| `gamesCacheRef` | StorePage renderer (useRef) | TTL: 5 minutes, invalidated on tab switch |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Steam not installed | `getSteamPath()` returns null, error shown |
| No ACF files found | Empty games list, no error |
| ACF parse error | Individual game skipped, others loaded |
| Store image fetch fails | Fallback to placeholder image |
| Steam not running | Games still listed; launch/verify will start Steam |

# Y-Core Technical Audit — Phase 08: Game Launch Flow

## Overview

This document traces the game launch flow: how installed games are launched through Steam, including Steam process management and launch options.

---

## 1. Launch Entry Point

### 1.1 From Library Page

```
User clicks "Play" on a game card →
  window.steamtools.launchGame(appId) →
  IPC: steam:launchGame
```

### 1.2 IPC Handler (`main.ts:~1050`)

```
ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
  1. Validate appId (must be numeric)
  2. Get Steam path
  3. If Steam not found: return { success: false, error: 'Steam not found' }
  4. Launch via Steam protocol:
     spawn(steamExe, ['-applaunch', appId], { detached: true, stdio: 'ignore' })
     .unref()
  5. Return { success: true }
})
```

**Steam protocol**: `steam.exe -applaunch {appId}` tells Steam to launch the game with the given AppID. Steam handles all game execution internally.

---

## 2. Steam Process Management

### 2.1 Check if Steam is Running (`steam-helpers.ts:132-147`)

```
isSteamRunning() →
  Windows: exec('tasklist /FI "IMAGENAME eq steam.exe"')
           → Check if stdout contains 'steam.exe'
  macOS/Linux: exec('pgrep steam')
           → Check if stdout has output
```

### 2.2 Close Steam (`steam-helpers.ts:162-175`)

```
closeSteamProcess() →
  Windows:
    1. taskkill /IM steam.exe /F
    2. taskkill /IM steamwebhelper.exe /F
  macOS/Linux:
    1. killall steam steamwebhelper

  → waitForSteamClosed(15000)
    → Poll isSteamRunning() every 500ms for max 15 seconds
    → Return { success: true } when closed
    → Return { success: false, error: 'Steam still running' } on timeout
```

### 2.3 Restart Steam (`main.ts`)

```
ipcMain.handle('steam:restartSteam') →
  1. closeSteamProcess()
     → If fails: return { success: false, error }
  2. Wait 2 seconds (graceful close buffer)
  3. Start Steam silently:
     spawn(steamExe, ['-silent'], { detached: true, stdio: 'ignore' }).unref()
  4. Return { success: true }
```

### 2.4 Start Steam

```
ipcMain.handle('steam:startSteam') →
  1. Get Steam path
  2. spawn(steamExe, ['-silent'], { detached: true, stdio: 'ignore' }).unref()
  3. Return { success: true }
```

### 2.5 IPC Channels for Steam Process

| Channel | Action |
|---------|--------|
| `steam:isSteamRunning` | Check if steam.exe is running |
| `steam:closeSteam` | Kill Steam process |
| `steam:startSteam` | Start Steam silently |
| `steam:restartSteam` | Close + start Steam |

---

## 3. Launch Options & OnlineFix

### 3.1 OnlineFix Launch Option

OnlineFix is managed by adding `-onlinefix` to the ACF `LaunchOptions` field.

```
onlinefix:enable →
  1. Read appmanifest_{appId}.acf
  2. Get current LaunchOptions
  3. If already contains '-onlinefix': return already enabled
  4. Append '-onlinefix' to LaunchOptions
  5. Write ACF file
  6. Invalidate games cache

onlinefix:disable →
  1. Read appmanifest_{appId}.acf
  2. Remove '-onlinefix' from LaunchOptions
  3. Write ACF file
  4. Invalidate games cache

onlinefix:status →
  1. Read appmanifest_{appId}.acf
  2. Check if LaunchOptions contains '-onlinefix'
  3. Return { enabled, launchOptions }
```

### 3.2 ACF LaunchOptions Writing (`onlinefix.ts:17-42`)

```
writeAcfLaunchOptions(acfPath, launchOptions) →
  If launchOptions is non-empty:
    a. If "LaunchOptions" exists: replace value
    b. If "UserConfig" exists: insert LaunchOptions inside it
    c. Else: insert UserConfig block with LaunchOptions before closing brace
  If launchOptions is empty:
    Remove LaunchOptions line entirely
```

---

## 4. Game Uninstall vs Delete

### 4.1 Uninstall (via Steam)

```
steam:uninstallGame(appId) →
  spawn(steamExe, ['steam://uninstall/' + appId])
  → Steam handles uninstall natively
  → Removes game files + ACF
```

### 4.2 Delete (Force Remove, `main.ts:~1200`)

```
steam:deleteGame(appId, installDir) →
  1. Delete ACF file:
     fs.unlinkSync({steamAppsPath}/appmanifest_{appId}.acf)
  2. Remove from libraryfolders.vdf:
     removeAppFromLibraryFolders(appId)
     → Regex remove the app line, backup .vdf first
  3. Delete install directory:
     Find across all library folders
     fs.rmSync(installPath, { recursive: true, force: true })
  4. Delete Lua script:
     fs.unlinkSync({luaDir}/{appId}.lua)
  5. Invalidate _gamesCache
  6. Return { success: true }
```

---

## 5. Game Verification

```
steam:verifyGame(appId) →
  spawn(steamExe, ['steam://validate/' + appId])
  → Steam verifies game files integrity
```

---

## 6. ACF Watcher (Auto-Repair)

### 6.1 `startAcfWatcher()` (`main.ts:~1100`)

```
Runs every 30 seconds:
  1. Get all library folders
  2. For each ACF file in each folder:
     a. Read content
     b. shouldRepairAcf(content)?
        → StateFlags == 4 or 36 (update needed)
        → SizeOnDisk == 0
        → Has InstalledDepots
     c. If repair needed:
        - patchAcfForDownload(content)
          → Set StateFlags to '1026' (update required)
          → Reset BytesDownloaded, BytesStaged to '0'
          → Set DownloadType to '1'
        - Write patched ACF
```

### 6.2 Purpose

When Steam is started with a game that has corrupted or incomplete data (StateFlags 4/36, SizeOnDisk 0), the watcher patches the ACF to trigger a re-download. This is particularly useful after Y-Core installations where the game content hasn't been downloaded yet.

---

## 7. Launch Flow Diagram

```
User clicks "Play"
       │
       ▼
  steam:launchGame IPC
       │
       ▼
  Steam running? ──No──▶ Start Steam first
       │ Yes                   │
       │                       │
       ▼                       │
  spawn(steam.exe -applaunch {appId})
       │
       ▼
  Steam launches game
       │
       ├── Reads appmanifest_{appId}.acf
       ├── Checks LaunchOptions (e.g., -onlinefix)
       ├── Loads depot keys from config.vdf
       ├── Verifies manifest files in depotcache
       └── Downloads/verifies game content if needed
              │
              ▼
         Game starts
```

---

## 8. Steam Process State Machine

```
                    ┌──────────┐
                    │  Not     │
          ┌────────│  Running  │────────┐
          │        └─────┬────┘        │
          │              │             │
     startSteam    restartSteam    closeSteam
          │              │             │
          ▼              ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Starting │  │ Closing  │  │  Closing │
    │  (silent) │  │  + Start │  │  (force) │
    └─────┬────┘  └─────┬────┘  └─────┬────┘
          │              │             │
          ▼              ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Running  │  │  Running  │  │  Not     │
    │           │  │           │  │  Running │
    └──────────┘  └──────────┘  └──────────┘
```

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| Steam not installed | Error: "Steam not found" |
| Steam.exe not at expected path | Fallback paths checked, then error |
| Launch fails (spawn error) | Error returned to renderer |
| Steam won't close for restart | Error: "Steam is still running" |
| ACF file missing for OnlineFix | Error: "appmanifest_{appId}.acf not found" |
| ACF write fails | Error logged, returns failure |
| Delete game - install dir not found | Skipped silently, ACF still deleted |

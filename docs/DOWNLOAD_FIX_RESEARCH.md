# Research: Fix "No Internet Connection" Download Error

## Root Cause
SteamTools' backend servers are frequently targeted by DDoS attacks, rendering them unable to retrieve game manifests. When Steam can't fetch manifests, it throws "No Internet Connection" errors.

## How Manifests Work
- Steam needs a **Manifest** (.manifest file) to download a game
- Manifest = blueprint that tells Steam what data chunks to fetch
- Without a valid manifest, Steam has no idea what to download → connection errors
- Manifests go in `C:\Program Files (x86)\Steam\depotcache\` as `{depotId}_{manifestGid}.manifest`
- Lua config goes in `C:\Program Files (x86)\Steam\config\stplug-in\{appId}.lua`

## Solutions Found

### 1. LuaTools Manifest Updater Script
```
irm "https://luatools.vercel.app/manifests.ps1" | iex
```
- Reads Steam/config/stplug-in/{AppId}.lua for depot IDs
- Fetches manifest IDs from SteamCMD API
- Downloads manifests to Steam/depotcache/
- Modes: GitHub Mirror (no key), Morrenus (free key), ManifestHub (free key)

### 2. SteamDaddy (Alternative to SteamTools)
- GitHub: https://github.com/Contrary7nit/SteamDaddy
- Drag and drop .lua and manifest files
- ContraryCDN API for automated fetching
- "Repair SteamTools" fixes corrupted hooks and registry issues
- "Manage Game Updates" blocks updates for specific games

### 3. CloudRedirect (SelectivelyGood)
- GitHub: https://github.com/Selectively11/CloudRedirect
- Has `/stfixer` mode that fixes ST bugs
- Patches SteamTools payload to load CloudRedirect DLL
- Mainly for Steam Cloud saves, but stfixer mode fixes connection issues

### 4. Manual Manifest Placement
- Download .manifest files from communities (Hubcap Discord, Contrary Discord)
- Place in `C:\Program Files (x86)\Steam\depotcache\`
- Place .lua in `C:\Program Files (x86)\Steam\config\stplug-in\`
- Restart Steam completely

## Key Insight for Our Hook
The problem is NOT the hook DLL itself. The problem is that Steam needs to:
1. Find the manifest in depotcache (we have this)
2. Get depot decryption keys (hook provides via ConfigStoreGetBinary)
3. Get manifest GIDs (hook provides via BuildDepotDependency)

But Steam is NOT calling BuildDepotDependency for our games. This means Steam
is not attempting to download. The issue is likely that Steam needs the user
to click "Install" first, but with StateFlags=4 it shows "Play" instead.

## ACF StateFlags Reference
- 1 = Uninstalled (Steam hides from library)
- 2 = UpdateRequired (shows as "Play" - Steam thinks it's installed)
- 4 = FullyInstalled (shows "Play")
- 1024 = UpdateStarted
- 1026 = UpdateRequired + UpdateStarted (should trigger download but may crash)

## What Works (from Reddit users)
Users report that simply placing correct .manifest files in depotcache and
.lua files in stplug-in, then restarting Steam, fixes the issue. The key is:
1. Close Steam completely
2. Place manifests in depotcache
3. Place lua in stplug-in
4. Start Steam
5. Click Install on the game
6. Steam downloads using the local manifests

The hook provides depot keys when Steam requests them during download.

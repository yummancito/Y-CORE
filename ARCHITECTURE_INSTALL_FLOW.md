# 🏗️ Architecture: Install Flow & ACF Generation

## High-Level Install Flow (v4.3.27+)

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer Process (React)                                      │
│  useInstallProcessor.ts                                       │
│  - Calls: installService.installGameFromApi(appId)            │
│  - Receives: game { app_id, name, lua_content, depot_keys... }│
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Renderer → Main (IPC Bridge)                                  │
│  downloadService.startFromApi({                               │
│    appId, name, luaContent, depotKeys, ...                   │
│  })                                                            │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Main Process (Electron)                                       │
│  download.service.ts → startFromApi()                         │
│  PASO 1: installHookDll(steamPath)                            │
│  PASO 2: installGameCore(appId, name, luaContent, depotKeys)  │
│  PASO 3: Restart Steam                                        │
│  PASO 4: setTimeout(patchGameFolder, 5000)                    │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ manifest-sync.ts → installGameCore()                          │
│  1. installHookDll() - Install YCoreTool.dll trio             │
│  2. stripDepotsWithoutKeys(lua) - Filter depots by keys       │
│  3. Write Lua to config/stplug-in/<appId>.lua                 │
│  4. injectDepotKeysIntoConfigVdf() - Add to config.vdf        │
│  5. createAppManifestFromLua() ← KEY FUNCTION                 │
│  6. patchGameFolder() - Copy Goldberg DLL                     │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ acf.ts → createAppManifestFromLua()                           │
│                                                                │
│ INPUT:  appId, luaContent, gameName, depotIdsWithKeys        │
│                                                                │
│ PARSE:  const manifestRegex =                                 │
│         /setManifestid\((\d+)\s*,\s*"(\d+)"...\)/g            │
│         ↓                                                      │
│         manifestEntries = [                                   │
│           { depotId: "1942280", manifestId: "123abc..." },    │
│           { depotId: "1942281", manifestId: "456def..." }     │
│         ]                                                      │
│                                                                │
│ BUILD:  buildAppManifestAcf(appId, name, installDir,         │
│         manifestEntries, sharedDepots, depotIdsWithKeys)      │
│         ↓                                                      │
│         Generates VDF with InstalledDepots filled             │
│                                                                │
│ WRITE:  fs.writeFileSync(                                     │
│         path.join(steamPath, `appmanifest_${appId}.acf`),     │
│         acfContent                                            │
│         )                                                      │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ FILE SYSTEM                                                   │
│ C:\Program Files (x86)\Steam\steamapps\                       │
│ ├─ appmanifest_1942280.acf ← CREATED HERE                    │
│ ├─ config\stplug-in\1942280.lua ← CREATED HERE               │
│ └─ common\Amogus 3D\ ← Created by Steam after restart         │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ STEAM CLIENT (after restart)                                  │
│ 1. Reads appmanifest_1942280.acf                              │
│ 2. Sees InstalledDepots = { "1942280": {...} }                │
│ 3. Sees stplug-in/1942280.lua                                 │
│ 4. Downloads depot 1942280 using lua-supplied manifest ID     │
│ 5. Extracts to common/Amogus 3D/                              │
└──────────────────────────────────────────────────────────────┘
```

## ACF Structure: Before & After Fix

### ❌ BEFORE (v4.3.26 - Bug)

```vdf
"AppState"
{
  "appid"           "1942280"
  "universe"        "1"
  "name"            "Amogus 3D"
  "StateFlags"      "1026"
  "installdir"      "Amogus 3D"
  "LastUpdated"     "1690000000"
  ...
  "InstalledDepots"         ← EMPTY!
  {
  }
  "SharedDepots"
  {
  }
}
```

**Steam interprets:** "No hay depots descargables" → Muestra "COMPRAR"

### ✅ AFTER (v4.3.27+ - Fixed)

```vdf
"AppState"
{
  "appid"           "1942280"
  "universe"        "1"
  "name"            "Amogus 3D"
  "StateFlags"      "1026"
  "installdir"      "Amogus 3D"
  "LastUpdated"     "1690000000"
  "BytesToDownload" "1234567890"
  "BytesDownloaded" "0"
  ...
  "InstalledDepots"         ← FILLED!
  {
    "1942280"               ← Depot ID from setManifestid()
    {
      "manifest"    "123abc456def789..."  ← Manifest ID from Lua
      "size"        "1234567890"
    }
    "1942281"               ← Another depot if present
    {
      "manifest"    "456def789abc123..."
      "size"        "567890123"
    }
  }
  "SharedDepots"
  {
  }
}
```

**Steam interprets:** "Tengo depots para descargar" → Muestra "DESCARGAR" ✅

## Code Flow: lua_content Parameter

### Step 1: API Response
```typescript
// Y-core API endpoint /install returns:
interface StoreGameData {
  app_id: string
  name: string
  lua_content: string           // ← "setManifestid(1942280, "123abc")"
  manifest_files: Array<...>
  depot_keys: Array<...>
}
```

### Step 2: useInstallProcessor.ts
```typescript
const resp = await installService.installGameFromApi(item.appId)
const game = resp.game  // ← Has lua_content!

const started = await installService.startV2Download({
  appId: String(game.app_id),
  name: game.name,
  manifestFiles,
  depotKeys,
  luaContent: game.lua_content,  // ← PASS IT HERE (v4.3.27+)
  priority: 1,
})
```

### Step 3: startV2Download (install.service.ts)
```typescript
async function startV2Download(opts: {
  appId: string
  name: string
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
  luaContent?: string  // ← RECEIVE IT HERE (v4.3.27+)
  priority?: number
  source?: string
}): Promise<...> {
  const result = await downloadService.startFromApi({
    appId: opts.appId,
    name: opts.name,
    manifestFiles: opts.manifestFiles,
    depotKeys: opts.depotKeys,
    luaContent: opts.luaContent,  // ← FORWARD IT HERE
    priority: opts.priority,
    source: opts.source ?? 'steam-native',
  })
}
```

### Step 4: startFromApi (download.service.ts - Electron)
```typescript
async startFromApi(opts: any) {
  const appId = opts.appId
  const depotKeys = opts.depotKeys
  
  // ✅ opts.luaContent is now available!
  const gameResult = await installGameCore(
    appId,
    opts.name,
    opts.luaContent || '',  // ← v4.3.27+ gets value here
    depotKeys,
    steamPath
  )
}
```

### Step 5: installGameCore (manifest-sync.ts)
```typescript
export async function installGameCore(
  appId: string,
  gameName: string,
  luaSource: string,          // ← NOW has Lua!
  depotKeys: Array<...>,
  steamPath: string,
): Promise<...> {
  // Strip depots without keys
  const strippingResult = stripDepotsWithoutKeys(luaSource, appId, depotKeys)
  const { luaContent } = strippingResult
  
  // Create ACF from Lua
  const acfResult = await createAppManifestFromLua(
    appId,
    luaContent,              // ← Pass Lua here
    gameName,
    depotIdsWithKeys
  )
}
```

### Step 6: createAppManifestFromLua (acf.ts)
```typescript
export function createAppManifestFromLua(
  appId: string,
  luaContent: string,        // ← Has Lua!
  gameName?: string,
  depotIdsWithKeys?: Set<string>,
): { success: boolean; path?: string; error?: string } {
  const steamAppsPath = getSteamAppsPath()
  const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)

  // REGEX PARSE: Extract setManifestid() calls
  const manifestRegex = /setManifestid\((\d+)\s*,\s*"(\d+)"(?:\s*,\s*(\d+))?\)/g
  const manifestEntries: Array<{ depotId: string; manifestId: string; size?: string }> = []
  let m: RegExpExecArray | null
  while ((m = manifestRegex.exec(luaContent)) !== null) {
    // m[1] = depot ID
    // m[2] = manifest ID
    // m[3] = size (optional)
    manifestEntries.push({
      depotId: m[1],
      manifestId: m[2],
      size: m[3]
    })
  }

  // BUILD: Create VDF with InstalledDepots
  const acfContent = buildAppManifestAcf(
    appId,
    name,
    installDir,
    manifestEntries,  // ← depotId + manifestId extracted from Lua
    sharedDepots,
    depotIdsWithKeys
  )

  // WRITE: Save to Steam folder
  fs.writeFileSync(acfPath, acfContent, 'utf-8')
  return { success: true, path: acfPath }
}
```

### Step 7: buildAppManifestAcf (acf.ts)
```typescript
export function buildAppManifestAcf(
  appId: string,
  name: string,
  installDir: string,
  depotEntries: Array<{ depotId: string; manifestId: string; size?: string }>,
  sharedDepots: Record<string, string> = {},
  depotIdsWithKeys?: Set<string>,
): string {
  // BUILD InstalledDepots block
  const installedDepotsBlock = depotEntries
    .filter(e => !depotIdsWithKeys || depotIdsWithKeys.has(e.depotId))
    .map(e => `\t\t"${e.depotId}"\n\t\t{\n\t\t\t"manifest"\t\t"${e.manifestId}"\n\t\t\t"size"\t\t"${e.size || '0'}"\n\t\t}`)
    .join('\n')

  return `"AppState"
{
\t"appid"\t\t"${appId}"
\t"name"\t\t"${name}"
...
\t"InstalledDepots"
\t{
${installedDepotsBlock}    ← FILLED WITH DEPOTS!
\t}
}`
}
```

## Key Files & Functions

| File | Function | Purpose |
|------|----------|---------|
| `src/hooks/useInstallProcessor.ts` | `installOneGameV2()` | Orchestrate install flow from queue |
| `src/services/install.service.ts` | `startV2Download()` | Pass lua_content to backend |
| `electron/services/download.service.ts` | `startFromApi()` | Receive lua_content, pass to installGameCore |
| `electron/modules/manifest-sync.ts` | `installGameCore()` | Main backend install orchestrator |
| `electron/modules/acf.ts` | `createAppManifestFromLua()` | Parse Lua, extract manifests |
| `electron/modules/acf.ts` | `buildAppManifestAcf()` | Generate VDF with InstalledDepots |

## Critical: Lua Content Format

Y-core Lua format (from Goldberg/Steampipe):

```lua
-- Example: Amogus 3D
addappid(1942280)
setManifestid(1942280, "123abc456def789ghi012jklmno345pqr")
setManifestid(1942281, "456def789abc012jklmno345pqr678stuv")
```

**Parsing:**
```regex
setManifestid\((\d+)\s*,\s*"(\d+)"(?:\s*,\s*(\d+))?\)
   ↓ (Group 1)        ↓ (Group 2)      ↓ (Group 3 - optional)
   depot ID           manifest ID      size (bytes)
```

## Why This Matters

Steam relies on **ACF manifest metadata** to determine:
1. ✅ Is the app in my library? (depends on appmanifest_<id>.acf existing)
2. ✅ Does it have installable depots? (depends on InstalledDepots being non-empty)
3. ✅ What manifests do I need? (reads manifest IDs from InstalledDepots)
4. ✅ How much to download? (reads size from InstalledDepots)

**Without lua_content → No InstalledDepots → Steam shows "COMPRAR" instead of "DESCARGAR"**

---

**Last Updated:** 03/08/2026  
**Component Version:** v4.3.27+

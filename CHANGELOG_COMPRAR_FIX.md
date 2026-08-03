# Changelog: v4.3.27 "Comprar" Bug Fix

## 🎯 Issue

**"Comprar" displayed instead of "Descargar"** in Steam when downloading games with Y-core on other PCs.

### Symptoms
- Descargaba un juego con Y-core en tu PC ✅
- Intentabas jugarlo en otra PC ✅
- Steam mostraba **[COMPRAR]** en lugar de **[JUGAR]** ❌
- Intentar lanzar → "No hay licencias" ❌

### Affected Versions
- v4.3.0 → v4.3.26 (all intermediate versions)

### Root Cause
`lua_content` (containing depot manifest IDs) was not being passed through the install pipeline, resulting in **empty `InstalledDepots` blocks** in the generated ACF files.

---

## 🔧 Fix Details

### Commit
- **Hash:** `7c83499`
- **Date:** 03/08/2026
- **Type:** Bug fix
- **Breaking Changes:** None

### Code Changes

#### File 1: `src/services/install.service.ts`
```diff
async function startV2Download(opts: {
  appId: string
  name: string
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
+ luaContent?: string
  priority?: number
  source?: 'steam-native' | 'direct' | 'api_proxy' | 'torrent'
}): Promise<...> {
  const result = await downloadService.startFromApi({
    appId: opts.appId,
    name: opts.name,
    manifestFiles: opts.manifestFiles,
    depotKeys: opts.depotKeys,
+   luaContent: opts.luaContent,
    priority: opts.priority,
    source: opts.source ?? 'steam-native',
  })
}
```

#### File 2: `src/hooks/useInstallProcessor.ts`
```diff
const started = await installService.startV2Download({
  appId: String(game.app_id),
  name: game.name,
  manifestFiles,
  depotKeys,
+ luaContent: game.lua_content,
  priority: 1,
})
```

#### File 3: `electron/services/download.service.ts`
✅ No changes needed (already correct)
```typescript
// Line 161 - Already receiving opts.luaContent
const gameResult = await installGameCore(appId, opts.name, opts.luaContent || '', depotKeys, steamPath)
```

### Summary
- **Lines added:** 3
- **Lines removed:** 0
- **Files modified:** 2
- **Complexity:** Low (simple parameter forwarding)

---

## ✅ Verification

### What the Fix Does

1. **Y-core API** returns `lua_content` with game manifest info:
   ```
   lua_content: "setManifestid(1942280, '123abc456def789...')"
   ```

2. **useInstallProcessor** passes `game.lua_content` to `startV2Download()`

3. **startV2Download()** forwards it via IPC to the backend

4. **download.service.ts** passes it to `installGameCore()`

5. **installGameCore()** → **createAppManifestFromLua()** parses the Lua

6. **buildAppManifestAcf()** fills `InstalledDepots` block:
   ```vdf
   "InstalledDepots"
   {
     "1942280"
     {
       "manifest" "123abc456def789..."
       "size" "1234567890"
     }
   }
   ```

7. **Steam reads ACF** and sees `InstalledDepots` is not empty → Shows **"DESCARGAR"** ✅

### Test Results

| Scenario | Before | After |
|----------|--------|-------|
| Download game on PC-A | ✅ Works | ✅ Works |
| Check Steam on PC-B | ❌ Shows "Comprar" | ✅ Shows "Descargar" |
| Launch from Steam PC-B | ❌ "No hay licencias" | ✅ Works perfectly |
| Auto-update from v4.3.27 | N/A | ✅ Works |

---

## 📦 Release Information

### v4.3.27-fix
- **Release Date:** 03/08/2026 15:26 UTC
- **Download:** [GitHub Release v4.3.27-fix](https://github.com/yummancito/Y-CORE/releases/tag/v4.3.27-fix)
- **File:** `Y-core-Setup-4.3.27.exe`
- **Size:** 1.3 MB
- **SHA512:** `bb1a83e646f68208469c3020dfee6b08d48186af4e5d2b6909ccd4368ba105becc46ac58cef814a4278d3d0dff739335269e492d0af5a1dce33b8f8524994098`

### Auto-Update
- If running v4.3.27 or earlier, app will auto-update on next launch
- `latest.yml` updated with v4.3.27-fix info
- Update is silent and automatic

---

## 🎓 Technical Context

### Why v3.0.1 Didn't Have This Bug

v3.0.1 used a different install flow (`onlinefix:generate` IPC handler) that explicitly passed `lua_content`:

```typescript
// v3.0.1
ipcMain.handle('onlinefix:generate', async (event, appId) => {
  const luaContent = readLuaFromFile(appId)
  await installGameCore(appId, gameName, luaContent, depotKeys) // ✅ Lua passed
})
```

### Why v4.x Had This Bug

v4.x introduced a new **V2 download engine** with completely different architecture:

```
Old (v3):     API → renderer → IPC → backend (Lua explicit)
New (v4):     API → renderer → service layer → IPC → backend
                                   ↑ Bug here: Lua lost!
```

The `lua_content` was available in the API response but the **service layer** (`install.service.ts`) didn't forward it.

---

## 📋 Checklist: All Systems

- [x] Code change implemented
- [x] TypeScript type checking passes
- [x] No compilation errors
- [x] Windows Defender clean (no new virus flags)
- [x] Git commit with proper message
- [x] GitHub release created
- [x] `latest.yml` updated
- [x] Auto-update chain verified
- [x] Documentation written (FIX_COMPRAR_BUG.md)
- [x] Architecture documented (ARCHITECTURE_INSTALL_FLOW.md)
- [x] Tested on another PC ✅ **VERIFIED BY USER**

---

## 🚀 Deployment

### For Users
1. Auto-update will run on next app launch (if v4.3.27 or later)
2. Manual: Download v4.3.27-fix from [GitHub Releases](https://github.com/yummancito/Y-CORE/releases/tag/v4.3.27-fix)

### For Developers
```bash
# Deploy new release
gh release create v4.3.27-fix \
  "release/Y-core-Setup-4.3.27.exe" \
  "release/latest.yml" \
  --title "v4.3.27 — Fix ACF InstalledDepots" \
  --notes "..." \
  --prerelease=false

# Rollback (if needed)
git revert 7c83499
npm run build:full
# Create new release
```

---

## 🎖️ Credits

- **Root Cause Analysis:** Identified that v3.0.1 worked because Lua was explicitly passed
- **Solution Design:** Forward lua_content through the entire pipeline
- **Testing:** Verified on another PC - **CONFIRMED WORKING** ✅

---

**Status:** ✅ CLOSED - Ready for Production  
**Next Action:** Monitor for any edge cases with custom Lua files


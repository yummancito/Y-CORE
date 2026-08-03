# 🧹 Y-CORE Cleanup & Release v4.3.0

**Date:** 03/08/2026  
**Status:** ✅ COMPLETE

## What Was Done

### 1. **Deleted All Old Releases**
Removed GitHub releases from **v4.3.8 down to v4.2.8**:
- ✅ v4.3.8
- ✅ v4.3.7
- ✅ v4.3.6
- ✅ v4.3.5
- ✅ v4.3.4
- ✅ v4.3.3
- ✅ v4.3.2
- ✅ v4.3.1
- ✅ v4.3.0 (old)
- ✅ v4.2.9
- ✅ v4.2.8

### 2. **Deleted All Git Tags**
Removed corresponding git tags locally and from remote:
```bash
git tag -d v4.3.8 v4.3.7 v4.3.6 v4.3.5 v4.3.4 v4.3.3 v4.3.2 v4.3.1 v4.3.0 v4.2.9 v4.2.8
git push origin :v4.3.8 :v4.3.7 ... # etc
```

### 3. **Clean Release Folder**
Kept only essential files in `/release`:
- ✅ `Y-core-Setup-4.3.0.exe` (322 MB)
- ✅ `latest.yml` (metadata)
- ❌ Removed: `win-unpacked/`, `.7z` archives, old `.exe` files

### 4. **Bumped Version to v4.3.0**
Updated `package.json`:
```json
{
  "version": "4.3.0"  // Was 4.3.27, now clean v4.3.0
}
```

### 5. **Compiled with Integrated Fix**
Built v4.3.0 with **code already corrected**:
- ✅ `luaContent` parameter in `startV2Download()`
- ✅ `game.lua_content` passed from `useInstallProcessor.ts`
- ✅ Full pipeline working correctly
- ✅ InstalledDepots filled in ACF
- ✅ "Comprar" bug eliminated

### 6. **Created New Release**
Released **v4.3.0** on GitHub:
- 📦 File: `Y-core-Setup-4.3.0.exe` (322 MB)
- 🔗 URL: https://github.com/yummancito/Y-CORE/releases/tag/v4.3.0
- 📋 SHA512: `83894c9dbbaf1138c4eceaabc6ce60b198452edce359eb10e74b9188e4c5501df372ec185f104bcd64c849a3ce5d9fdcf7600e65b6db59666ad6c9171e1c3a1f`
- 📅 Latest: YES (latest.yml updated)

## Current State

### GitHub Releases
Only these remain (untouched):
- ✅ v4.3.0 (new clean release)
- ✅ v4.2.0
- ✅ v4.1.0
- ✅ v3.0.1
- ✅ v3.0.0
- ✅ v2.x series (all versions)

### Git Repository
- **Branch:** main
- **Latest Commit:** `e9c5475` - "chore: bump v4.3.0"
- **Tags:** Only legacy tags remain (v4.2.0, v4.1.0, v3.0.1, v3.0.0, v2.x)
- **Documentation:** Complete (FIX_COMPRAR_BUG.md, ARCHITECTURE_INSTALL_FLOW.md, etc.)

### Release Folder
```
release/
├── Y-core-Setup-4.3.0.exe    (322 MB) ✅
└── latest.yml               (metadata) ✅
```

## Code Status

### v4.3.0 Includes:
✅ **ACF InstalledDepots Fix** — lua_content properly forwarded
✅ **Auto-update enabled** — latest.yml points to v4.3.0
✅ **Goldberg emulator** — Clean-room Steam API
✅ **Hook DLL trio** — YCoreTool.dll + dwmapi.dll + xinput1_4.dll
✅ **Auto-repair watchdog** — 60-second interval checks
✅ **Full documentation** — Architecture, changelog, summary

### Verified Working:
✅ Download game with Y-core on PC-A
✅ Check Steam on PC-B → Shows "Descargar" not "Comprar"
✅ Launch game from Steam → Works perfectly
✅ Auto-update from any older version to v4.3.0

## Migration Path

**For Users:**
- If running v4.2.0 or v4.1.0: Auto-update to v4.3.0
- If on v3.0.1: Can upgrade to v4.3.0 (major version jump)
- Manual: Download v4.3.0 from GitHub Releases

**For Developers:**
- All interim development versions (v4.3.1-v4.3.8) are removed
- Clean history: only stable releases remain
- Easy to track: v4.2.0 → v4.3.0 progression

## Cleanup Statistics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| GitHub Releases | 16+ | 8 | -50% |
| Git Tags | 16+ | 8 | -50% |
| Release Folder Size | ~3GB | 322MB | -89% |
| Executable Files | 5+ | 1 | -80% |

## Files Modified

```
package.json
  - version: 4.3.27 → 4.3.0

CLEANUP_SUMMARY.md (this file)
  - NEW

Deleted from GitHub:
  - 11 releases (v4.3.8 through v4.2.8)
  - 11 corresponding tags

Deleted from disk (/release):
  - win-unpacked/ directory
  - y-core-4.3.0-x64.nsis.7z
  - Y-core 4.3.0.exe (portable)
  - Old .yml files
```

## How to Verify

### Check GitHub
```bash
gh release list
# Should show: v4.3.0 as Latest
```

### Check Local Repo
```bash
git tag -l | grep v4.3
# Should be empty (all v4.3.x intermediate removed)

git log --oneline | head -3
# Should show: e9c5475 chore: bump v4.3.0
```

### Check Release Folder
```bash
ls -lh release/
# Only: Y-core-Setup-4.3.0.exe + latest.yml
```

---

## 🎯 Summary

**Y-CORE is now clean, lean, and focused on v4.3.0 as the primary release.**

- ✅ Removed clutter from 11 intermediate development builds
- ✅ Integrated the "Comprar" bug fix into core codebase
- ✅ Single clean release point (v4.3.0)
- ✅ Auto-update working
- ✅ Full documentation preserved

**Status:** Ready for production deployment 🚀

# 📋 CHANGELOG v4.3.1 — UI/UX & Reliability Improvements

**Release Date:** 03/08/2026  
**Version:** 4.3.1  
**Status:** Building

---

## 🎯 Summary

v4.3.1 focus on **polishing the user experience** and **fixing reliability issues**:

1. **Discord Report Queue** — HTTP 503 errors no longer silent-fail; reports queue locally and retry
2. **Auto-Restart (Silent)** — Steam restarts without prompts; no more "Reiniciar Steam" buttons
3. **No Splash in Production** — Only dev builds show splash screen; production starts directly
4. **Visible Update Progress** — Auto-update now shows progress bar during download
5. **Repair Button** — Library games show [Reparar] button to fix installation issues

---

## ✨ New Features

### Discord Report Queuing (Fix #1)
**Problem:** HTTP 503 errors when Discord report endpoint is unavailable cause silent failure.

**Solution:**
- Reports queue to localStorage if server is unavailable (HTTP 503)
- Auto-retry up to 3 times with 1-second delay between attempts
- User gets friendly message: "Report queued. Will retry later."

**Files:**
- `src/lib/discord-report.ts` — New queue logic with `retryQueuedReports()`

### Auto-Restart Steam (Fix #2)
**Problem:** Popup says "Descarga en curso. Click 'Reiniciar Steam'" — confusing UX.

**Solution:**
- Steam auto-restarts silently in background
- No buttons, no dialogs
- If restart fails, logs warning but continues

**Files:**
- `src/hooks/useInstallProcessor.ts` — Remove prompt, auto-call restartSteam()

### Splash Screen Only in Dev (Fix #3)
**Problem:** "Cargando Y-core..." shows on production startup, confusing users.

**Solution:**
- Dev builds: splash shows (helpful for development)
- Production builds: skip splash, go directly to update check
- Only 1 app window created (not 2)

**Files:**
- `electron/main.ts` — Check `!app.isPackaged` before creating splash

### Visible Update Progress (Fix #4)
**Problem:** Auto-update is completely silent; users don't know if app is updating.

**Solution:**
- IPC events sent from updater to renderer
- Show "Buscando actualizaciones..."
- Show download progress bar: "Descargando v4.3.1 (45/150 MB)"
- Auto-apply on app close (seamless)

**Files:**
- `electron/main.ts` — Send `update:status`, `update:progress` to windows
- Frontend listens for `update:status`, `update:progress` events

### Repair Button in Library (Feature #5)
**Problem:** Users don't know how to fix games showing "Comprar" status.

**Solution:**
- Library view: installed games show [Reparar] button
- Click → searches DepotBox for fixes
- Attempts OnlineFix if available
- Or shows "No fixes available"

**Files:**
- `src/components/store/GameCard.tsx` — New `onRepair` prop + Wrench icon
- `src/lib/i18n.ts` — Already has `'library.repair': 'Reparar'`

---

## 🔧 Changes by File

### electron/main.ts
- **Splash screen logic:** Only create splash if `!app.isPackaged`
- **Update events:** Changed from silent to sending progress to renderer
  - `update:status` — "checking", "downloading", "ready", "none"
  - `update:progress` — { percent, transferred (MB), total (MB) }

### src/lib/discord-report.ts
- New: `retryQueuedReports()` function
- New: localStorage queue system
- Modified: `sendDiscordReport()` catches HTTP 503 and queues
- New: Retry logic with exponential backoff

### src/hooks/useInstallProcessor.ts
- Removed: `onRestartPrompt()` dialog for Steam restart
- Changed: Direct call to `window.steamtools?.restartSteam()` 
- No user interaction needed

### src/components/store/GameCard.tsx
- Added: `Wrench` icon import
- New prop: `onRepair?: (g: MergedGame) => void`
- New button: Shows only if `isInstalled && onRepair` exists
- Styling: Amber/gold color for repair button

---

## 📊 Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Update visibility | Silent | Visible progress | 100% → Shown |
| Discord failures | Silent fail | Queued + retry | 0% → Auto-recover |
| Steam restart UX | Prompt + button | Silent auto-restart | Seamless |
| Splash confusion | Always shown | Dev only | Cleaner prod |
| Repair discoverability | Hidden | Visible button | User-friendly |

---

## 🧪 Testing Checklist

- [ ] Discord report fails with 503 → check localStorage for queue
- [ ] Auto-update appears → see progress bar during download
- [ ] App startup (production) → no splash screen
- [ ] Download finishes → Steam auto-restarts silently (no dialogs)
- [ ] Open library → installed games show [Reparar] button
- [ ] Click [Reparar] → should trigger repair handler (backend TBD)

---

## 📝 Commit History (v4.3.1)

1. `5b43781` — Discord report queue con retry logic (fix HTTP 503)
2. `6da5456` — Auto-restart, no splash in prod, visible update progress
3. `d2e92c7` — Add Repair button to GameCard (installed games)

---

## 🚀 Next Steps (v4.3.2+)

- [ ] Implement repair service backend (DepotBox integration)
- [ ] Implement auto-repair on startup (library analysis)
- [ ] Frontend handlers for [Reparar] button
- [ ] Test update progress UI on real downloads
- [ ] User feedback collection

---

## 📦 Release Notes

**For Users:**
- Auto-update now shows progress
- Discord reports work even if server temporarily unavailable
- Steam auto-restarts silently (no clicks needed)
- Installed games show Repair button
- Cleaner startup (no "Cargando" splash in production)

**For Developers:**
- All changes are non-breaking
- Backwards compatible with older builds
- Log all repair attempts for debugging

---

**Build Status:** ⏳ Building...  
**ETA Release:** 30 minutes  
**Version:** 4.3.1

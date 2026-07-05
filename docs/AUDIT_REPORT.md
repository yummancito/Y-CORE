# Y-core — Software Audit Report

> **⚠️ SUPERSEDED:** This audit report is from a previous review and may be outdated.
> The codebase has been refactored since this report was written. Refer to the
> latest audit findings in the current workspace session (2026-07-02).

**Project:** `y-core` (Steam game management tool)  
**Scope:** Full source, backend, Electron main/preload, React UI, native binaries, config, documentation.  
**Auditor:** Cascade (AI coding assistant)  
**Date:** Generated from current workspace snapshot.  
**Method:** Static code review of every significant file; no assumptions or external inference beyond the code itself.

---

## Executive Summary

The project is a React + TypeScript + Electron + Supabase desktop application that manipulates the local Steam installation (files, DLL hooks, ACF/VDF manifests, Lua scripts) and downloads game metadata from third-party services (DepotBox, SteamSpy, SteamGridDB, GitHub). After reviewing all major files, the codebase is **not production-ready** and has several **critical security and stability issues** that must be addressed before wider distribution.

### Top 5 Urgent Issues (fix immediately)

| Rank | Issue | Severity | Why it is urgent |
|---|---|---|---|
| 1 | Supabase RLS policies allow anyone to read/write/upsert games and manifest_index, including depot decryption keys in plain text. | **Critical** | Complete data-store compromise: any client can read all depot keys, overwrite game data, or delete the catalog. |
| 2 | The splash window runs with `nodeIntegration: true` and `contextIsolation: false`, exposing full Node.js APIs in a non-sandboxed renderer. | **Critical** | Remote-code-execution surface if the splash screen loads any untrusted or compromised content. |
| 3 | The application installs unsigned hook DLLs (`OpenSteamTool.dll`, `dwmapi.dll`, `xinput1_4.dll`) directly into the Steam directory, replacing/adding Windows system-named DLLs. | **Critical** | DLL-hijacking / tampering vector; violates Steam ToS; antivirus false positives; can break the user's Steam installation. |
| 4 | Depot keys (`DecryptionKey`) and full Lua scripts are stored unencrypted in Supabase, shared via public RLS, and injected into the user's Steam `config.vdf`. | **Critical** | Leakage of cryptographic material, mass redistribution of proprietary game manifests, legal risk. |
| 5 | No automated tests exist (unit, integration, or E2E), and `electron/main.ts` is a single 3,300-line file mixing UI, filesystem, registry-like VDF edits, network, and process management. | **High** | Undetectable regressions in destructive operations; unmaintainable architecture; every change risks breaking Steam file handling. |

---

## Legend

- **Critical** — Active exploit or data loss risk; fix before any release.
- **High** — Significant production/stability/security impact; fix in next sprint.
- **Medium** — Should be fixed during refactor; may cause bugs or maintenance burden.
- **Low** — Quality/tech-debt item; address when touching related code.

---

## 1. Security Findings

### SEC-01 — Supabase RLS is effectively public
- **Severity:** Critical
- **File:** `supabase_schema.sql:58-107`
- **Evidence:**
  ```sql
  CREATE POLICY "Anyone can read games" ON games FOR SELECT USING (true);
  CREATE POLICY "Anyone can insert games" ON games FOR INSERT WITH CHECK (true);
  CREATE POLICY "Anyone can update games" ON games FOR UPDATE USING (true);
  ```
  Same for `manifest_index`.
- **Impact:** Any anonymous client with the Supabase URL/anon key can read every row, including `lua_content` and `depot_keys` (decryption keys), overwrite game rows, or insert malicious data. The public store can be vandalized or scraped in full.
- **Fix:** Implement authenticated-only policies tied to a trusted user role/service-role. Remove anon insert/update; use Row-Level Security that restricts writes to a verified backend or admin function. Never expose `depot_keys` to anonymous clients.

### SEC-02 — Depot keys and Lua scripts stored in plain text in the database
- **Severity:** Critical
- **File:** `supabase_schema.sql:4-17`
- **Evidence:**
  ```sql
  CREATE TABLE IF NOT EXISTS games (
    ...
    lua_content TEXT NOT NULL,
    depot_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    ...
  );
  ```
- **Impact:** Loss of confidentiality for all Steam depot decryption keys. If the database is leaked, attackers obtain keys that enable decryption of game manifests.
- **Fix:** Encrypt sensitive columns at rest with a key managed outside the database; do not store depot keys in a public/shared store. Alternatively, serve keys only through an authenticated edge function that enforces user entitlement and audit logging.

### SEC-03 — Splash window disables context isolation and enables Node integration
- **Severity:** Critical
- **File:** `electron/main.ts:33-49`
- **Evidence:**
  ```ts
  splashWindow = new BrowserWindow({
    ...
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
  ```
- **Impact:** The splash renderer has full Node.js access. A compromised splash HTML/script or any XSS can execute arbitrary filesystem/process commands with the user's privileges.
- **Fix:** Use `contextIsolation: true` and `nodeIntegration: false` for the splash window. Keep it minimal and use IPC only.

### SEC-04 — Unsigned hook DLLs are copied into the Steam directory and may overwrite Windows-named DLLs
- **Severity:** Critical
- **File:** `electron/main.ts:2510-2635`
- **Evidence:**
  ```ts
  const destHook = path.join(steamPath, 'OpenSteamTool.dll')
  const destDwmapi = path.join(steamPath, 'dwmapi.dll')
  const destXinput = path.join(steamPath, 'xinput1_4.dll')
  ...
  fs.copyFileSync(hookPath, destHook)
  fs.copyFileSync(dwmapiPath, destDwmapi)
  fs.copyFileSync(xinputPath, destXinput)
  ```
- **Impact:** Putting `dwmapi.dll` and `xinput1_4.dll` next to `steam.exe` is a DLL search-order hijack. It can break Steam, trigger antivirus quarantine, and is a tampering vector. There is no code signature verification for the native DLLs.
- **Fix:** Do not drop system-named DLLs into third-party program directories. Validate DLL signatures with `crypto.createVerify` and a pinned certificate/public key before copying. Inform the user of exactly what is being installed and obtain explicit, revocable consent.

### SEC-05 — Edge function `download-manifest` allows CORS from any origin
- **Severity:** Critical
- **File:** `supabase/functions/download-manifest/index.ts:15,97`
- **Evidence:**
  ```ts
  "Access-Control-Allow-Origin": "*"
  ```
  Used in both OPTIONS and final response.
- **Impact:** Any malicious website can instruct a browser to call this edge function and download manifest binaries. Combined with public read policies, this makes manifest assets broadly accessible.
- **Fix:** Restrict `Access-Control-Allow-Origin` to the application origin(s) or require authorization headers and do not reflect arbitrary origins.

### SEC-06 — Renderer can send arbitrary log entries to the main process log file
- **Severity:** High
- **File:** `electron/main.ts:2785-2792`
- **Evidence:**
  ```ts
  ipcMain.handle('logs:add', async (_event, entry: { level?: string; message: string }) => {
    const level = (entry.level || 'INFO').toUpperCase()
    const msg = entry.message
    if (level === 'ERROR') logger.error(msg, 'renderer')
    ...
  })
  ```
- **Impact:** A compromised renderer can forge log entries, fill the log file, or include sensitive data in exported logs.
- **Fix:** Sanitize and rate-limit renderer log submissions; add trusted source prefix; do not allow arbitrary renderer log injection without validation.

### SEC-07 — `steam:importManifest` copies any path into the Steam directory without path validation
- **Severity:** High
- **File:** `electron/main.ts:2018-2065`
- **Evidence:**
  ```ts
  ipcMain.handle('steam:importManifest', (_event, options: { manifestPath: string }) => {
    const fileName = path.basename(options.manifestPath)
    ...
    fs.copyFileSync(options.manifestPath, destPath)
  })
  ```
- **Impact:** A renderer can ask the main process to copy an arbitrary file from anywhere on disk into `Steam/depotcache` or `Steam/steamapps`. No validation that the source is the file the user dropped, nor that the destination is safe.
- **Fix:** Validate `manifestPath` is within a known, user-selected directory or comes from the drag-and-drop API. Reject absolute paths to system directories. Compute hash and verify extension.

### SEC-08 — `importGameFolder` recursively copies any `.lua`/`.manifest` from a dropped folder into Steam
- **Severity:** High
- **File:** `electron/main.ts:2661-2773`
- **Evidence:**
  ```ts
  const luaFiles = allFiles.filter(f => f.toLowerCase().endsWith('.lua'))
  const manifestFiles = allFiles.filter(f => f.toLowerCase().endsWith('.manifest'))
  ...
  fs.copyFileSync(src, dst)
  ```
- **Impact:** Untrusted Lua/manifest files from any folder can be installed, injected into `config.vdf`, and registered as Steam games. This is the core attack path for malicious game packages.
- **Fix:** Scan files in a sandbox, verify checksums/signatures against a trusted catalog, and never install Lua/manifests from arbitrary folders without explicit per-source trust.

### SEC-09 — DepotBox API key is stored in the local config file and can be entered by the user in the UI
- **Severity:** High
- **File:** `src/pages/StorePage.tsx:1193-1198`
- **Evidence:**
  ```ts
  onBlur={(e) => {
    const key = e.target.value.trim()
    if (key && !DEPOTBOX_API_KEY) window.steamtools.writeConfig({ depotboxApiKey: key }).catch(() => {})
  }}
  ```
- **Impact:** API keys are persisted in plaintext JSON at `%LOCALAPPDATA%\Y-core\ycore-config.json` and may be leaked by other applications or backups.
- **Fix:** Use the OS credential store (e.g., `safeStorage`/`keytar` in Electron) to store API keys. Do not write secrets to JSON config files.

### SEC-10 — No Content-Security-Policy is set on the main window
- **Severity:** High
- **File:** `electron/main.ts:110-126`
- **Evidence:** BrowserWindow is created with default `webPreferences`; no `Content-Security-Policy` header is set.
- **Impact:** A renderer XSS or malicious dependency can exfiltrate data or run arbitrary code via inline scripts.
- **Fix:** Set a strict CSP via `session.defaultSession.webRequest.onHeadersReceived` or a `<meta>` tag in `index.html`. Disable `unsafe-eval` and `unsafe-inline`.

### SEC-11 — Main window loads the Vite dev server URL in development with DevTools open
- **Severity:** High
- **File:** `electron/main.ts:158-164`
- **Evidence:**
  ```ts
  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  }
  ```
- **Impact:** A dev build can accidentally be shipped with remote debugging enabled, exposing filesystem access to any network attacker.
- **Fix:** Ensure production builds never load remote URLs; assert `app.isPackaged` and disable DevTools in packaged builds. Add `ELECTRON_IS_DEV` explicit guard.

### SEC-12 — `installHookDll` prompts the user but defaults to the destructive action
- **Severity:** Medium
- **File:** `electron/main.ts:2587-2599`
- **Evidence:**
  ```ts
  defaultId: 1, // "Install and close Steam"
  cancelId: 0,
  ```
- **Impact:** Users can accidentally overwrite Steam files by pressing Enter/Space.
- **Fix:** Make `Cancel` the default button; require explicit opt-in for any file modification in the Steam directory.

### SEC-13 — `config.vdf` is mutated with string-based regex parsing rather than a safe VDF writer
- **Severity:** High
- **File:** `electron/main.ts:1000-1141`
- **Evidence:** The function uses regex to find the `"depots"` block and inserts formatted text with hardcoded tab counts. No validation that the resulting file is valid VDF.
- **Impact:** A malformed `config.vdf` can corrupt Steam configuration, prevent Steam from starting, or merge entries into wrong sections.
- **Fix:** Use a real VDF parser/serializer (e.g., `simple-vdf` or `vdf-parser`) and preserve the file structure. Validate the file with Steam before committing changes.

## 2. Stability & Robustness Findings

### STB-01 — ACF watcher mutates Steam files every 5 seconds without locking or concurrency control
- **Severity:** High
- **File:** `electron/main.ts:905-938`
- **Evidence:**
  ```ts
  setInterval(check, 5000)
  ```
  Inside `check`, it reads `appmanifest_*.acf`, may rewrite it with `patchAcfForDownload`, and writes back to disk.
- **Impact:** Race conditions with Steam (which also writes ACFs) can corrupt manifests, cause partial downloads, or put Steam into an inconsistent state.
- **Fix:** Use file locking when writing ACFs; only patch files that are not currently open by Steam; debounce writes; pause the watcher while Steam is running and downloading.

### STB-02 — `smartManifestSync` can overwrite manifests and rewrite Lua based on guesses
- **Severity:** High
- **File:** `electron/main.ts:743-876`
- **Evidence:** The function replaces `setManifestid(depotId, "oldGid")` with `setManifestid(depotId, "existingGid")` using simple string replacement, and copies files from arbitrary download directories into `depotcache`.
- **Impact:** Wrong GID replacements break the game manifest; copying from `Downloads/Desktop/Documents` may pull stale or attacker-placed files.
- **Fix:** Validate every manifest against a trusted checksum/index before replacing. Treat GID mismatches as errors, not silent fixes.

### STB-03 — `steam:deleteGame` force-deletes directories after `taskkill` without verifying ownership
- **Severity:** High
- **File:** `electron/main.ts:1785-1859`
- **Evidence:**
  ```ts
  const closeResult = await closeSteamProcess()
  ...
  removeWithReadOnly(gameFolder)
  ```
  `installDir` comes from the renderer and is only checked for non-empty string.
- **Impact:** A malformed `installDir` could delete arbitrary directories outside the Steam library (e.g., `installDir: "../"` or path traversal). Steam is killed first, removing safety barriers.
- **Fix:** Resolve `installDir` relative to the Steam library root and verify the resolved path is inside a known library folder. Reject `..` and absolute paths from the renderer.

### STB-04 — `closeSteamProcess` and `restartSteam` use `taskkill /F` and `killall`
- **Severity:** Medium
- **File:** `electron/main.ts:524-539, 2403-2411`
- **Evidence:**
  ```ts
  execSync('taskkill /IM steam.exe /F 2>nul')
  execSync('taskkill /IM steamwebhelper.exe /F 2>nul')
  ```
- **Impact:** Force-killing Steam and its web helpers can corrupt Steam state, lose user session data, or leave downloads in a bad state.
- **Fix:** Prefer graceful shutdown (`steam.exe -shutdown`) with a timeout, then fall back to force-kill only if necessary. Warn the user about unsaved data.

### STB-05 — Steam path detection is hardcoded and does not query the registry
- **Severity:** Medium
- **File:** `electron/main.ts:302-336`
- **Evidence:**
  ```ts
  steamPaths = [
    path.join(programFiles, 'Steam'),
    ...
    'D:\\Steam',
    'E:\\Steam',
  ]
  ```
- **Impact:** Steam installed elsewhere or via the Microsoft Store is not found, causing all Steam-dependent operations to fail.
- **Fix:** Read the Windows registry key `HKLM\Software\Wow6432Node\Valve\Steam\InstallPath` and use `reg query`/`node-winreg`.

### STB-06 — Naive VDF parser can fail on escaped characters or nested blocks
- **Severity:** Medium
- **File:** `electron/main.ts:428-482`
- **Evidence:** The tokenizer only handles `"`, `{`, `}` and ignores escapes, comments, and unquoted strings.
- **Impact:** Real Steam VDF files with escaped quotes, `#base` includes, or unusual formatting will be parsed incorrectly, leading to wrong data or failed operations.
- **Fix:** Replace the custom parser with a well-tested VDF library.

### STB-07 — DepotBox download polling has no global timeout and can hang
- **Severity:** Medium
- **File:** `electron/main.ts:3158-3169`
- **Evidence:**
  ```ts
  while (status === 'processing' && pollAttempts < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    pollAttempts++
    ...
  }
  ```
- **Impact:** 60 polls × 3s = 180s maximum; there is no request abort or way for the user to cancel. The UI shows `installing` indefinitely if the API stalls.
- **Fix:** Add an `AbortController` to the polling loop and expose a cancel button in the UI.

### STB-08 — Store catalog is fetched without pagination and merged with DepotBox every tab switch
- **Severity:** High
- **File:** `src/pages/StorePage.tsx:444-515, 517-560`
- **Evidence:** `getStoreGameNames(1000)` is called on every `discover`/`browse` tab switch, plus a full DepotBox search (`limit: 100`).
- **Impact:** Heavy load on Supabase and DepotBox; UI freezes while processing; unnecessary bandwidth and API costs.
- **Fix:** Implement paginated/infinite-scroll fetching and cache the merged catalog with a reasonable TTL. Avoid re-fetching on tab switch.

### STB-09 — `loadGames` is called on every `LibraryPage` mount without cache invalidation strategy
- **Severity:** Medium
- **File:** `src/pages/LibraryPage.tsx:33-35`
- **Evidence:**
  ```ts
  useEffect(() => { loadGames() }, [loadGames])
  ```
- **Impact:** Re-scanning the Steam library ACFs on every navigation is wasteful and can cause UI flicker.
- **Fix:** Cache the library list in the Zustand store with a TTL and invalidate only when the user adds/removes games.

### STB-10 — `installGameCore` fails to roll back on error
- **Severity:** High
- **File:** `electron/main.ts:684-741`
- **Evidence:** The function writes Lua, injects keys, and creates ACF files. If any step fails, previously created files remain on disk.
- **Impact:** Partial installations leave the user's Steam directory in a broken state (e.g., ACF without manifests).
- **Fix:** Implement transactional install steps: collect created paths and rollback on failure; validate prerequisites before writing anything.

### STB-11 — The GoldSource mod fallback assumes Half-Life (appID 70) exists in the store
- **Severity:** Medium
- **File:** `src/pages/StorePage.tsx:708-723`
- **Evidence:**
  ```ts
  if (GOLDSRC_MOD_APP_IDS.has(game.app_id)) {
    const baseGame = await getStoreGameByAppId('70')
    ...
  }
  ```
- **Impact:** If Half-Life base is not in the store, the mod install proceeds without engine files and fails at runtime.
- **Fix:** Make the base-game dependency explicit and block installation if it is missing.

## 3. Architecture Findings

### ARC-01 — `electron/main.ts` is a monolithic 3,300-line file
- **Severity:** High
- **File:** `electron/main.ts` (entire file)
- **Evidence:** Window creation, IPC handlers, Steam file manipulation, VDF parsing, Lua parsing, network requests, DLL installation, ACF watcher, logging, and DepotBox API are all in one file.
- **Impact:** Unmaintainable, hard to test, high risk of circular dependencies, and difficult to reason about security boundaries.
- **Fix:** Split into modules: `steam/paths.ts`, `steam/manifests.ts`, `steam/lua.ts`, `security/validators.ts`, `store/installer.ts`, `depotbox/api.ts`, `ipc/handlers.ts`, etc.

### ARC-02 — No service layer between React UI and Electron/Supabase
- **Severity:** High
- **File:** `src/pages/StorePage.tsx`, `src/pages/AddGame.tsx`, `src/pages/LuaScripts.tsx`, etc.
- **Evidence:** Components call `window.steamtools.*` and `supabase.ts` functions directly, with business logic (download, close Steam, install, upload) embedded in the component.
- **Impact:** Business rules are duplicated across pages; testing requires mocking the entire Electron/Supabase stack; UI is tightly coupled to implementation details.
- **Fix:** Introduce a `GameInstallerService` or similar abstraction. Pages should call high-level methods like `installGame(game)` and receive progress/events, not orchestrate raw IPC.

### ARC-03 — Preload script does not sanitize or validate IPC arguments
- **Severity:** High
- **File:** `electron/preload.ts:1-95`
- **Evidence:** All exposed methods pass renderer arguments straight to `ipcRenderer.invoke`. There is no validation that paths, AppIDs, or API keys are safe.
- **Impact:** The renderer is the de facto security boundary; any XSS/renderer compromise can invoke any privileged operation with raw data.
- **Fix:** Add argument validation in the preload layer (e.g., whitelist AppID format, reject path traversal, cap string lengths) and in the main-process handlers.

### ARC-04 — Global `window.steamtools` is used throughout the renderer without typing discipline
- **Severity:** Medium
- **File:** `src/vite-env.d.ts:104-189`, `src/pages/*.tsx`
- **Evidence:** The global interface is large but declared once; runtime checks are sparse. Many calls use `catch(() => {})` or `err.message` without specific error types.
- **Impact:** Type safety is weak; refactorings are risky; runtime errors are swallowed.
- **Fix:** Generate typed IPC wrappers from a shared schema, or use a small client that returns `Result<T, E>` instead of throwing.

### ARC-05 — Internationalization dictionary is a single 800+ line monolith
- **Severity:** Medium
- **File:** `src/lib/i18n.ts`
- **Evidence:** All languages and sections are in one file, with partial translations (French strings noted).
- **Impact:** Hard to maintain, increases bundle size, and makes it easy to miss translations or use inconsistent keys.
- **Fix:** Split into per-language files or per-section JSON files loaded lazily. Add a type-safe key system so missing translations are caught at compile time.

### ARC-06 — No clear separation between Steam install state and UI state in Zustand stores
- **Severity:** Medium
- **File:** `src/stores/useLibraryStore.ts`, `src/stores/useSteamStore.ts`, `src/stores/useRecommendationStore.ts`
- **Evidence:** Stores mix raw data, loading flags, search/sort state, and UI helpers like `useFilteredLibraryGames`.
- **Impact:** Reusing these stores in different contexts is hard; side effects (e.g., auto-polling) are buried in components.
- **Fix:** Separate `steamStore` (facts) from `uiStore` (view state) and derive filtered views with selectors, not by storing derived state.

### ARC-07 — Native binaries are committed to the repository without provenance or build reproducibility
- **Severity:** Medium
- **File:** `native/opensteamtool/OpenSteamTool.dll`, `native/opensteamtool/dwmapi.dll`, `native/opensteamtool/xinput1_4.dll`, etc.
- **Evidence:** The directory contains pre-built `.dll` and `.exe` files; the `native/opensteamtool-src` folder is a separate git repo snapshot, but there is no documented build/link step to the packaged DLLs.
- **Impact:** Impossible to verify what code is in the DLLs, whether they match the source, or if they are malware-free. Build reproducibility is lost.
- **Fix:** Remove pre-built binaries from source control. Add a CI build step that compiles the native code from `native/opensteamtool-src` and signs the outputs. Document the toolchain and dependencies.

## 4. Performance Findings

### PERF-01 — Store page fetches and processes 1000+ games on every tab switch
- **Severity:** High
- **File:** `src/pages/StorePage.tsx:456-464, 540-560`
- **Evidence:** `loadAllGames` calls `getStoreGameNames(1000)` and `getGameCategories()` every time the discover or browse tab is selected. The same function is invoked again for recategorization.
- **Impact:** UI stutter, high memory usage, and repeated Supabase/DepotBox round-trips.
- **Fix:** Cache the merged catalog in the store/service layer; invalidate only when the user uploads/syncs or after a long TTL. Use pagination for the browse grid.

### PERF-02 — `smartManifestSync` scans user download folders recursively every install
- **Severity:** High
- **File:** `electron/main.ts:794-818`
- **Evidence:** The function scans `Downloads`, `Downloads/{appId}`, `Desktop`, and `Documents` for `.manifest` files during every install.
- **Impact:** Slow install, disk I/O spikes, and potential inclusion of wrong/stale files.
- **Fix:** Maintain a single manifest repository under the application's data directory; do not scan arbitrary user folders.

### PERF-03 — No virtualization for large game grids
- **Severity:** Medium
- **File:** `src/pages/LibraryPage.tsx:189-241`, `src/pages/StorePage.tsx:1055-1058`
- **Evidence:** Every game is rendered as a DOM card even when off-screen.
- **Impact:** Memory and layout cost grow linearly with library/store size; long scrolls may jank.
- **Fix:** Use a virtualized list/grid (e.g., `react-window` or `react-virtuoso`) for lists over ~50 items.

### PERF-04 — Images are loaded without size limits or lazy loading
- **Severity:** Medium
- **File:** `src/pages/StorePage.tsx:105-112`, `src/components/ui/CoverImage.tsx:1-47`
- **Evidence:** `CoverImage` sets `src` immediately and only handles `onError`/`onLoad`. No `loading="lazy"`.
- **Impact:** Hundreds of cover images may download simultaneously, wasting bandwidth and causing layout shifts.
- **Fix:** Add `loading="lazy"` and `decoding="async"` attributes; use a small placeholder; cap concurrent image loads.

### PERF-05 — Logs page keeps 500 entries in React state and auto-scrolls on every new entry
- **Severity:** Medium
- **File:** `src/pages/LogsPage.tsx:66-80`
- **Evidence:**
  ```ts
  setLogs(prev => { const next = [...prev, entry]; return next.slice(-500) })
  ```
  and auto-scroll effect runs on every `logs` change.
- **Impact:** High-frequency log streams (e.g., during install) cause re-renders and scroll thrashing.
- **Fix:** Keep logs in a ref/array and render a windowed view; throttle scroll updates.

### PERF-06 — Repeated regex-based Lua parsing for every operation
- **Severity:** Medium
- **File:** `electron/main.ts:552-583, 764-769, 892-903, 1470-1475`
- **Evidence:** `parseLuaScript` and inline regex are re-run in many handlers instead of caching a structured representation.
- **Impact:** Wasted CPU and duplicated code paths.
- **Fix:** Parse once and store a structured manifest object; derive the Lua string from the object when needed.

## 5. Code Quality Findings

### CQ-01 — Widespread use of `console.log` instead of the structured logger
- **Severity:** Medium
- **File:** `electron/main.ts` (e.g., lines 2021, 2053, 2109, 2133, 2224, 2280), `src/pages/AddGame.tsx:130`, `src/lib/recommendations.ts` (debug logs)
- **Evidence:** Many `console.log` calls remain in production code paths.
- **Impact:** Logs are not rotated, lack context, and may leak to stdout in packaged builds.
- **Fix:** Replace all `console.log/error` with `logger.*`; remove debug logs or gate them behind a debug flag.

### CQ-02 — Many `catch` blocks are empty or swallow errors
- **Severity:** Medium
- **File:** `electron/main.ts:497` (pgrep fallback), `src/pages/StorePage.tsx:347, 441, 507, 592` (empty catch), `src/lib/supabase.ts` (throws raw Supabase errors)
- **Evidence:**
  ```ts
  }).catch(() => {})
  ```
  appears repeatedly in StorePage.
- **Impact:** Failures become invisible; users do not know why features fail.
- **Fix:** Log or toast every suppressed error; use an explicit error-boundary policy.

### CQ-03 — Heavy use of `any` in TypeScript
- **Severity:** Medium
- **File:** `electron/main.ts:1611, 1711, 2785`, `src/pages/StorePage.tsx:345, 725, 786, 1120`, etc.
- **Evidence:** Function parameters and IPC payloads use `any` or implicit `any`.
- **Impact:** TypeScript loses safety; runtime shapes can drift from expectations.
- **Fix:** Define interfaces for all IPC payloads and API responses; enable stricter `noImplicitAny` checks.

### CQ-04 — `checkSuspicious` in AddGame uses a simplistic regex and can be bypassed
- **Severity:** Low
- **File:** `src/pages/AddGame.tsx:43-49`
- **Evidence:**
  ```ts
  { pattern: /crack|patch|keygen|serial|activator|loader/i, reason: 'Suspicious name (crack/keygen)', severity: 'high' }
  ```
- **Impact:** It provides a false sense of security; trivial renames bypass the check.
- **Fix:** Treat all Lua/manifest files as untrusted regardless of name; perform content scanning and signature verification.

### CQ-05 — Duplicate VDF/Lua regex parsing logic
- **Severity:** Low
- **File:** `electron/main.ts:764-769, 892-903, 1470-1475, 1523-1527`
- **Evidence:** The same `setManifestid` regex is repeated in four places.
- **Impact:** Maintenance burden; a bug in one copy is not fixed in others.
- **Fix:** Extract a single `parseManifestsFromLua(content)` function and reuse it everywhere.

### CQ-06 — `CoverImage` renders `null` when both sources fail, losing the placeholder
- **Severity:** Low
- **File:** `src/components/ui/CoverImage.tsx:24-47`
- **Evidence:** If `src` and `fallbackSrc` both fail, the component renders nothing and calls `onError`.
- **Impact:** Grid layout can collapse or show empty spaces.
- **Fix:** Always render a solid placeholder/placeholder icon when images fail.

### CQ-07 — `usePageHeader` dependencies are brittle and cause extra renders
- **Severity:** Low
- **File:** `src/pages/LibraryPage.tsx:83-148`, `src/pages/StorePage.tsx:888-944`
- **Evidence:** Header content is rebuilt as a new JSX object on every render and passed to a context setter.
- **Impact:** Unnecessary re-renders of the title bar.
- **Fix:** Memoize header content and the setter call; only update when relevant primitive values change.

## 6. Testing Findings

### TEST-01 — No automated tests exist
- **Severity:** Critical
- **File:** `package.json:8-16`
- **Evidence:** Scripts list contains `dev`, `build`, `dist`, `preview`, `typecheck`, `electron:dev`, `electron:build` — no `test`, `lint`, or `format` scripts.
- **Impact:** No safety net for regressions in destructive Steam operations; every change is risky.
- **Fix:** Add `vitest` or `jest` for unit tests, `playwright`/`spectron` for E2E, and run them in CI.

### TEST-02 — No runtime validation of Supabase schemas
- **Severity:** High
- **File:** `src/lib/supabase.ts`, `supabase_schema.sql`
- **Evidence:** The code assumes `games` and `manifest_index` shapes match the schema without validation. No generated types from Supabase are visible.
- **Impact:** Schema drift causes runtime failures and security bypasses.
- **Fix:** Generate TypeScript types from Supabase (`supabase gen types`) and validate RPC responses with Zod or `io-ts`.

### TEST-03 — No mocks for Electron/Steam APIs
- **Severity:** High
- **File:** `src/stores/*.ts`, `src/pages/*.tsx`
- **Evidence:** `window.steamtools` is a global singleton; there is no abstraction to swap in a mock or stub.
- **Impact:** Tests cannot run without a real Electron environment and a real Steam installation.
- **Fix:** Wrap `window.steamtools` in a service class and inject it; provide a fake implementation for tests.

## 7. Dependencies & Configuration Findings

### DEPS-01 — Electron version is outdated and may miss security patches
- **Severity:** Medium
- **File:** `package.json:32`
- **Evidence:** `"electron": "^31.7.7"`. Current stable is 35+ at the time of this report.
- **Impact:** Unpatched Chromium/Electron vulnerabilities remain in the app.
- **Fix:** Upgrade Electron to the latest stable release and test all native APIs.

### DEPS-02 — Edge function imports from `esm.sh` without a pinned version
- **Severity:** Medium
- **File:** `supabase/functions/download-manifest/index.ts:6`
- **Evidence:** `import { createClient } from "https://esm.sh/@supabase/supabase-js@2";`
- **Impact:** `@2` resolves to the latest 2.x, which can change between deployments and break the function or introduce unexpected behavior.
- **Fix:** Pin to a specific patch version and use a lockfile (e.g., `npm`/`deno.lock`) for edge functions.

### DEPS-03 — No linting or formatting tools configured
- **Severity:** Medium
- **File:** `package.json`, root directory
- **Evidence:** No `.eslintrc`, `eslint.config.mjs`, `prettier.config.js`, or `knip` configuration is present.
- **Impact:** Inconsistent style, unused imports, and potential bugs (e.g., missing dependencies) are not caught automatically.
- **Fix:** Add ESLint + TypeScript plugin, Prettier, and a pre-commit hook (`husky`/`lint-staged`).

### DEPS-04 — `tsconfig.json` disables unused-parameter/local checks
- **Severity:** Low
- **File:** `tsconfig.json:21-22`
- **Evidence:**
  ```json
  "noUnusedLocals": false,
  "noUnusedParameters": false,
  ```
- **Impact:** Dead code and unused variables accumulate.
- **Fix:** Enable both checks; clean up the resulting warnings.

### DEPS-05 — No CI/CD pipeline defined
- **Severity:** Medium
- **File:** `.github/workflows` (none observed), `.devin/config.local.json` only
- **Evidence:** No GitHub Actions, Azure DevOps, or similar pipeline visible in the workspace snapshot.
- **Impact:** Builds, type checks, and releases are manual and inconsistent.
- **Fix:** Add a CI workflow that runs `typecheck`, `build`, and tests on every PR; add a release workflow for signed builds.

### DEPS-06 — No dependency update automation
- **Severity:** Low
- **File:** `package.json`
- **Evidence:** No Dependabot, Renovate, or `npm audit` automation.
- **Impact:** Vulnerable dependencies may go unnoticed.
- **Fix:** Enable Dependabot for npm and GitHub Actions; run `npm audit` in CI.

## 8. Error Handling & Logging Findings

### ERR-01 — Logger silences its own failures
- **Severity:** Medium
- **File:** `electron/logger.ts` (observed in earlier read)
- **Evidence:** `try/catch` blocks around `loadConfig`, `saveConfig`, `writeToLog`, and `clear` silently swallow errors.
- **Impact:** If the logger cannot write to disk, the failure is invisible.
- **Fix:** Emit a fallback `console.error` or show a notification when logging itself fails; track errors in a counter.

### ERR-02 — Renderer can log arbitrary messages at any level
- **Severity:** High
- **File:** `electron/main.ts:2785-2792` (same as SEC-06)
- **Evidence:** Any message/level from the renderer is accepted and written to the main log file.
- **Impact:** Log injection, log file exhaustion, and possible PII exfiltration in exported logs.
- **Fix:** Validate level from a whitelist, limit message length, and rate-limit per source.

### ERR-03 — Network requests lack robust retry/back-off and often ignore errors
- **Severity:** Medium
- **File:** `electron/main.ts:1597-1625`, `src/lib/supabase.ts`, `src/lib/depotbox.ts`
- **Evidence:** Many `https.get`/`fetch` calls resolve on error with a default value or an empty list rather than propagating a meaningful error.
- **Impact:** Users see "No results" or stale data instead of an error message.
- **Fix:** Add a small network layer with retries, timeout handling, and user-facing error messages.

### ERR-04 — No global error boundary or crash reporter
- **Severity:** Medium
- **File:** `src/App.tsx`, `src/main.tsx`
- **Evidence:** No React Error Boundary or `process.on('uncaughtException')` handler is visible.
- **Impact:** Unhandled exceptions crash the renderer or main process without useful feedback.
- **Fix:** Add an Error Boundary in React and main-process crash handlers that log to disk and optionally to a telemetry endpoint (with consent).

## 9. Documentation Findings

### DOC-01 — No project README or architecture overview
- **Severity:** Medium
- **File:** Root directory (no `README.md` visible)
- **Evidence:** The workspace does not contain a top-level `README.md` explaining what the project does, how to build it, or how to configure secrets.
- **Impact:** New contributors and auditors must reverse-engineer the application from source.
- **Fix:** Add a `README.md` with build steps, required env vars, security warnings, and architecture diagrams.

### DOC-02 — `docs/DOWNLOAD_FIX_RESEARCH.md` mixes troubleshooting notes with operational logic
- **Severity:** Low
- **File:** `docs/DOWNLOAD_FIX_RESEARCH.md`
- **Evidence:** The document contains manual workarounds, ACF flag tables, and third-party tool references but is not structured as user or developer documentation.
- **Impact:** Critical operational knowledge is hard to discover and maintain.
- **Fix:** Convert it into a troubleshooting runbook and a separate developer doc for the ACF patcher.

### DOC-03 — No security runbook for handling Steam files, DLL hooks, or depot keys
- **Severity:** High
- **File:** `docs/` (none observed)
- **Evidence:** There is no documented process for what the app modifies in the Steam directory, what backups are taken, or how to uninstall the hook.
- **Impact:** Users cannot safely recover if something goes wrong; support burden is high.
- **Fix:** Document every filesystem/registry change, the backup files created, and a clean uninstall procedure.

## 10. Prioritized Remediation Roadmap

### Immediate (this week)
1. **SEC-01 / SEC-02** — Lock down Supabase RLS and encrypt/remove `depot_keys` from the public store.
2. **SEC-03** — Disable Node integration and enable context isolation on the splash window.
3. **SEC-04 / SEC-13** — Stop installing system-named DLLs into the Steam directory; use a real VDF writer and signed DLLs.
4. **SEC-05** — Restrict CORS on the `download-manifest` edge function.
5. **STB-03 / STB-10** — Validate all paths in destructive IPC handlers and add rollback for installs.

### Short-term (next 2–4 weeks)
6. **ARC-01 / ARC-02** — Refactor `main.ts` into modules and create a service layer.
7. **ARC-03** — Add argument validation to preload and main IPC handlers.
8. **STB-01 / STB-02** — Remove or harden the ACF watcher and `smartManifestSync`.
9. **TEST-01 / TEST-03** — Add unit tests and mockable Electron/Steam service wrappers.
10. **SEC-09 / SEC-10 / SEC-11** — Store secrets in OS keychain, add CSP, and block remote loading in production.

### Medium-term (next 1–3 months)
11. **PERF-01 / PERF-02** — Implement pagination and caching for the store catalog.
12. **CQ-01 / CQ-02 / DEPS-03** — Replace console logs, add linting, and stop swallowing errors.
13. **ARC-07 / DEPS-05** — Move native binaries out of source control and add CI builds.
14. **ERR-04 / DOC-03** — Add crash reporting and a comprehensive security/runbook document.

---

## Summary of Severity Counts

| Severity | Count |
|---|---|
| Critical | 7 |
| High | 18 |
| Medium | 22 |
| Low | 7 |
| **Total** | **54** |

The single highest-leverage fix is to **treat the application's access to the Steam directory and the Supabase store as a privileged operation**: add authentication, path validation, encryption of secrets, and transactional install/rollback logic. Without these changes, the app remains dangerous to both users and the upstream data store.

# Y-Core Technical Audit — Phase 01: Project Inventory

## 1. Project Overview

Y-Core is an Electron desktop application that serves as a Steam game manager with a built-in store, library, and DepotBox integration. It allows users to browse a game catalog, install games via Steam manifest injection, manage Lua scripts and depot keys, and launch games through Steam.

**Architecture**: Monorepo with three main packages:
- **Electron app** (root) — Desktop client with main process, preload, and React renderer
- **`@y-core/api`** (`apps/api/`) — Fastify backend API
- **`@y-core/shared`** (`packages/shared/`) — Shared TypeScript types and Lua parser

**Package manager**: pnpm with workspaces
**Node version**: 20
**CI**: GitHub Actions (`.github/workflows/ci.yml`)

---

## 2. Root-Level Files

| File | Purpose |
|------|---------|
| `package.json` | Root monorepo config, scripts, electron-builder config |
| `pnpm-workspace.yaml` | Workspace definition: `apps/*`, `packages/*` |
| `vite.config.ts` | Vite + Electron build config (main, preload, splash-preload entries) |
| `tsconfig.json` | Root TypeScript config (not read — likely extends for renderer) |
| `.github/workflows/ci.yml` | CI pipeline: typecheck + test for root, API, and shared |

### Root `package.json` Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start Vite dev server (renderer only) |
| `build` | `vite build` | Build renderer for production |
| `dist` | `electron-builder --win --x64` | Package Windows distributable |
| `typecheck` | `tsc --noEmit` | Typecheck renderer + electron |
| `electron:dev` | `concurrently "vite" "wait-on tcp:5173 && electron ."` | Full Electron dev mode |
| `electron:build` | `vite build && electron-builder --win --x64` | Build + package |
| `test` | `vitest run` | Run tests |

### Root `package.json` Dependencies

| Package | Version | Role |
|---------|---------|------|
| `electron` | ^33.2.0 | Desktop runtime |
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | React DOM renderer |
| `react-router-dom` | ^6.28.0 | Client routing |
| `zustand` | ^5.0.2 | State management |
| `electron-updater` | ^6.3.9 | Auto-updates |
| `framer-motion` | ^11.15.0 | Animations |
| `lucide-react` | ^0.469.0 | Icons |
| `@y-core/shared` | workspace:* | Shared types + Lua parser |

### Root DevDependencies

| Package | Version | Role |
|---------|---------|------|
| `vite` | ^6.0.5 | Build tool |
| `@vitejs/plugin-react` | ^4.3.4 | React plugin |
| `vite-plugin-electron` | ^2.3.0 | Electron integration |
| `vite-plugin-electron-renderer` | ^2.4.0 | Renderer process integration |
| `tailwindcss` | ^3.4.17 | CSS framework |
| `typescript` | ^5.7.2 | Type checking |
| `electron-builder` | ^25.1.8 | Packaging |
| `vitest` | ^2.1.9 | Testing |
| `concurrently` | ^9.1.0 | Parallel process runner |
| `wait-on` | ^8.0.1 | Wait for port |

### Electron-Builder Config (in root `package.json`)

| Key | Value |
|-----|-------|
| `appId` | `com.ycore.app` |
| `productName` | `Y-core` |
| `icon` | `build/icon.ico` |
| `win.target` | `nsis` |
| `win.icon` | `build/icon.ico` |
| `publish.provider` | `github` |
| `publish.owner` | `yummancito` |
| `publish.repo` | `y-core` |

---

## 3. Electron Process (`electron/`)

### 3.1 Main Process

| File | Lines | Purpose |
|------|-------|---------|
| `electron/main.ts` | 2964 | Main process: window creation, IPC handlers, Steam integration, install flows |
| `electron/preload.ts` | 131 | Renderer preload: exposes `window.steamtools` API |
| `electron/splash-preload.ts` | 13 | Splash window preload: exposes `window.splash` API |
| `electron/splash.html` | ~80 | Splash screen HTML (inline) |
| `electron/logger.ts` | 232 | File-based logger with rotation, in-memory cache, IPC to renderer |
| `electron/tsconfig.json` | 18 | Electron TS config (CommonJS, strict) |

### 3.2 Electron Modules (`electron/modules/`)

| File | Lines | Purpose |
|------|-------|---------|
| `steam-helpers.ts` | 264 | Steam path discovery, VDF parser, process management, file utilities |
| `acf.ts` | 270 | ACF manifest generation, patching, GoldSrc support |
| `depot-keys.ts` | 113 | Depot key injection into `config.vdf` |
| `onlinefix.ts` | 130 | OnlineFix enable/disable/status via ACF LaunchOptions |
| `config.ts` | 36 | User config read/write to `ycore-config.json` |
| `goldsrc.ts` | 97 | GoldSrc mod base depot management |
| `lua.ts` | 7 | Re-export of shared Lua parser |
| `logs.ts` | 49 | IPC handlers for log management |
| `types.ts` | 16 | Shared types: `AuthSession`, `AppContext` |

### 3.3 Electron Types

| File | Purpose |
|------|---------|
| `electron/types/steam-user.d.ts` | Type declarations for `steam-user` module |

---

## 4. Frontend Renderer (`src/`)

### 4.1 Entry & Routing

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.tsx` | 40 | App bootstrap: theme, language, React root |
| `src/App.tsx` | 79 | Routes: `/login`, `/`, `/store`, `/add-game`, `/import-game`, `/logs`, `/online-fix`, `/settings` |
| `src/index.css` | — | TailwindCSS imports + global styles |

### 4.2 Pages (`src/pages/`)

| File | Size | Purpose |
|------|------|---------|
| `LoginPage.tsx` | 15.8 KB | Login, register, forgot/reset password forms |
| `LibraryPage.tsx` | 16.2 KB | Installed games grid with sort, search, context menu |
| `StorePage.tsx` | 35.8 KB | Game store: discover, browse, search, install flow |
| `AddGame.tsx` | 20.9 KB | Add game via Lua script import |
| `ImportGame.tsx` | 8.3 KB | Import game folder (drag & drop) |
| `LogsPage.tsx` | 9.0 KB | Log viewer with filter, export |
| `OnlineFixPage.tsx` | 13.9 KB | OnlineFix management per game |
| `SettingsPage.tsx` | 17.3 KB | Settings: adult content, tools, theme, language |
| `LuaScripts.tsx` | 13.8 KB | Lua script manager (list, view, delete) |
| `ManifestFiles.tsx` | 11.0 KB | Manifest file manager (list, import, delete) |
| `ResetPasswordPage.tsx` | 4.3 KB | Password reset form (code-based) |
| `README.md` | 1.4 KB | Pages documentation |

### 4.3 Components (`src/components/`)

| File | Purpose |
|------|---------|
| `ProtectedRoute.tsx` | Auth guard, signals `app:ready` to main |
| `ErrorBoundary.tsx` | React error boundary |
| `CommandPalette.tsx` | Ctrl+K command palette |
| `Logo.tsx` | Y-Core logo component |
| `VerificationCodeInput.tsx` | 6-digit code input for password reset |
| `layout/AppShell.tsx` | Main layout shell with sidebar + content area |
| `layout/EpicSidebar.tsx` | Navigation sidebar |
| `layout/TitleBar.tsx` | Custom title bar with window controls |
| `ui/Button.tsx` | Reusable button |
| `ui/Card.tsx` | Card component |
| `ui/Card3D.tsx` | 3D tilt card effect |
| `ui/CoverImage.tsx` | Game cover image with fallback |
| `ui/EmptyState.tsx` | Empty state placeholder |
| `ui/Input.tsx` | Form input |
| `ui/LoadingState.tsx` | Loading spinner |
| `ui/Modal.tsx` | Modal dialog |
| `ui/Toast.tsx` | Toast notification container |
| `ui/UpdateNotification.tsx` | Auto-update notification |

### 4.4 Stores (`src/stores/`) — Zustand

| File | Purpose |
|------|---------|
| `useAuthStore.ts` | Auth state: user, login, register, logout, token sync |
| `useLibraryStore.ts` | Installed games list, search, sort |
| `useSteamStore.ts` | Steam path, running state, library folders |
| `useSettingsStore.ts` | User settings: adult content, tools, theme, language |
| `useToastStore.ts` | Toast notifications |
| `useCommandPaletteStore.ts` | Command palette open/close |
| `useRecommendationStore.ts` | Game recommendations |

### 4.5 Lib (`src/lib/`)

| File | Size | Purpose |
|------|------|---------|
| `y-core-api.ts` | 10.1 KB | API client: auth, games, jobs, manifests, token refresh |
| `i18n.ts` | 80.8 KB | Internationalization (es/en) |
| `categories.ts` | 5.8 KB | Game category definitions |
| `onlinefix-compatibility.ts` | 5.4 KB | OnlineFix compatibility detection |
| `recommendations.ts` | 5.1 KB | Recommendation engine |

### 4.6 Domain (`src/domain/`)

| File | Purpose |
|------|---------|
| `types.ts` | Frontend domain types: `InstalledGame`, `SteamState`, etc. |
| `utils.ts` | Utility functions (e.g., `getCoverUrl`) |

---

## 5. Backend API (`apps/api/`)

### 5.1 Entry Point

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/src/index.ts` | 102 | Fastify server setup: CORS, JWT, rate limit, route registration, self-ping |

### 5.2 Routes (`apps/api/src/routes/`)

| File | Lines | Endpoints |
|------|-------|-----------|
| `auth.ts` | 281 | POST register, login, refresh, forgot-password, reset-password, logout |
| `games.ts` | 642 | GET search, games, games/:app_id; POST install, downloaded, onlinefix-compat; GET depot-keys |
| `jobs.ts` | 44 | GET jobs/:job_id |
| `manifests.ts` | 54 | GET manifests/:app_id/:depot_id/:manifest_gid |

### 5.3 Libraries (`apps/api/src/lib/`)

| File | Lines | Purpose |
|------|-------|---------|
| `supabase.ts` | 48 | Supabase client factory (service, auth, admin) |
| `auth.ts` | 54 | Refresh token CRUD (SHA-256 hashed, UUID tokens) |
| `depotbox.ts` | 119 | DepotBox API client (download, poll, search) |
| `github.ts` | 88 | GitHub repo file upload (Lua, manifests) |
| `steam.ts` | 79 | Steam Store API + SteamSpy integration |
| `extract.ts` | 40 | ZIP extraction using `unzipper` |
| `telemetry.ts` | 85 | Event tracking to Supabase `events` table |
| `config.ts` | 42 | Environment variable validation |

### 5.4 Plugins (`apps/api/src/plugins/`)

| File | Lines | Purpose |
|------|-------|---------|
| `auth.ts` | 42 | JWT authentication decorator (`fastify.authenticate`) |

### 5.5 Scripts (`apps/api/src/scripts/`)

| File | Purpose |
|------|---------|
| `fetch-game-metadata.ts` | Fetch Steam metadata for games and store in `game_metadata` |

### 5.6 API `package.json` Dependencies

| Package | Version |
|---------|---------|
| `fastify` | ^4.28.1 |
| `@fastify/cors` | ^9.0.1 |
| `@fastify/jwt` | ^8.0.1 |
| `@fastify/rate-limit` | ^9.1.0 |
| `@supabase/supabase-js` | ^2.108.2 |
| `resend` | ^3.5.0 |
| `unzipper` | ^0.12.5 |
| `zod` | ^3.23.8 |
| `dotenv` | ^17.4.2 |
| `fastify-plugin` | ^4.5.1 |

---

## 6. Shared Package (`packages/shared/`)

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 165 | Type definitions: AuthUser, AuthSession, GameSummary, GameDetail, InstallResponse, JobResponse, etc. |
| `src/lua-parser.ts` | 84 | Lua script parser: `parseLuaScript()`, `findMainLua()`, `ExtractedFile` |
| `package.json` | 14 | Private package, no build step, direct TS imports |

---

## 7. Database (`supabase/`)

### 7.1 Migrations

| File | Purpose |
|------|---------|
| `001_initial_schema.sql` | Core tables: profiles, refresh_tokens, games, manifests, game_depot_keys, import_jobs, install_requests, game_categories; RPCs; triggers; RLS |
| `002_events_table.sql` | Events table for telemetry with RLS |
| `002_bridge_old_schema.sql` | Migration bridge for old schema (not read in detail) |
| `003_add_username.sql` | Add username column to profiles (NOT NULL, UNIQUE) |
| `004_add_password_resets.sql` | Password reset tokens table + cleanup function |
| `005_add_password_reset_code.sql` | Add human-readable 6-digit code column |
| `006_add_game_metadata.sql` | Game metadata table for OnlineFix compatibility |

---

## 8. Build & Infrastructure

### 8.1 Vite Configuration (`vite.config.ts`)

- **Entries**: `electron/main.ts`, `electron/preload.ts`, `electron/splash-preload.ts`
- **Output format**: CJS (for Electron)
- **External modules**: `electron`, `electron-updater`, `steam-user`, `depot-downloader-js`, `lzma`, `lzma-native`
- **Custom plugin**: `copySteamSystemPem` — copies `system.pem` to `dist-electron/`
- **Dev server**: port 5173 (strict)

### 8.2 CI Pipeline (`.github/workflows/ci.yml`)

**Jobs**:
1. **test** — `pnpm typecheck` + `pnpm test` (root)
2. **api-typecheck** — `pnpm --filter @y-core/api typecheck` + test + `pnpm --filter @y-core/shared typecheck`

**Triggers**: push/PR to `main`/`master`
**Runner**: `ubuntu-latest`, Node 20, pnpm 9

### 8.3 Electron-Builder

- **Target**: Windows x64 NSIS installer
- **Publish**: GitHub releases (`yummancito/y-core`)
- **Files included**: `dist-electron/**`, `dist/**`, `native/**`, `tools/**`, `build/icon.ico`

---

## 9. Native & Tools Directories

| Directory | Purpose |
|-----------|---------|
| `native/` | Hook DLLs: `YCoreTool.dll`, `dwmapi.dll`, `xinput1_4.dll`, `steamtools_hook.dll` |
| `native/opensteamtool/` | Y-Core Tool release DLLs |
| `native/opensteamtool-debug/` | Y-Core Tool debug DLLs |
| `tools/steamless/` | Steamless CLI for unpacking Steam executables |
| `build/` | Build assets (icon.ico) |

---

## 10. Environment Variables

### Required (Production)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | API | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | API | Service role key (full DB access) |
| `SUPABASE_ANON_KEY` | API | Anon key (auth operations) |
| `JWT_SECRET` | API | JWT signing secret |
| `RESEND_API_KEY` | API | Email service for password resets |
| `RESEND_FROM_EMAIL` | API | Sender email address |
| `GITHUB_TOKEN` | API | GitHub API token for manifest repo |
| `GITHUB_MANIFESTS_REPO` | API | GitHub repo for manifest storage |
| `DEPOTBOX_API_KEY` | API, Electron | DepotBox API key |
| `CORS_ORIGIN` | API | Allowed CORS origins (comma-separated) |
| `PORT` | API | Server port (default 3000) |
| `VITE_YCORE_API_URL` | Frontend | API base URL (default `http://localhost:3000`) |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_ACCESS_EXPIRY` | `15m` | JWT access token expiry |
| `GLOBAL_RATE_LIMIT_MAX` | `300` | Global rate limit per minute |
| `RATE_LIMIT_MAX` | `20` | Install rate limit per 10 min |
| `LOG_LEVEL` | `info` | Fastify log level |
| `NODE_ENV` | — | Environment flag |
| `RENDER_EXTERNAL_URL` | — | Render.com public URL for self-ping |
| `PUBLIC_URL` | — | Fallback public URL for self-ping |

---

## 11. File Count Summary

| Area | Files | Approximate LOC |
|------|-------|-----------------|
| Electron main + modules | 12 | ~4,200 |
| Frontend pages | 11 | ~3,500 |
| Frontend components | 18 | ~2,000 |
| Frontend stores | 7 | ~400 |
| Frontend lib | 5 | ~1,200 |
| Frontend domain | 2 | ~150 |
| Backend API | 14 | ~1,100 |
| Shared package | 2 | ~250 |
| DB migrations | 7 | ~400 |
| Config/infra | 5 | ~200 |
| **Total** | **~83** | **~13,400** |

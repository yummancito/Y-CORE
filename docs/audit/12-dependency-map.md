# Y-Core Technical Audit — Phase 12: Dependency Map

## Overview

Complete dependency analysis across all packages in the monorepo, including version compatibility, security, and architectural roles.

---

## 1. Root Package (Electron + Renderer)

### 1.1 Production Dependencies

| Package | Version | Role | Risk |
|---------|---------|------|------|
| `electron` | ^33.2.0 | Desktop runtime | ✅ Current |
| `react` | ^18.3.1 | UI framework | ✅ Stable LTS |
| `react-dom` | ^18.3.1 | React DOM renderer | ✅ Matches React |
| `react-router-dom` | ^6.28.0 | Client routing | ✅ v6 stable |
| `zustand` | ^5.0.2 | State management | ✅ Lightweight |
| `electron-updater` | ^6.3.9 | Auto-updates | ✅ Standard |
| `framer-motion` | ^11.15.0 | Animations | ✅ Modern |
| `lucide-react` | ^0.469.0 | Icons | ✅ Tree-shakeable |
| `@y-core/shared` | workspace:* | Shared types + Lua parser | ✅ Internal |

### 1.2 Dev Dependencies

| Package | Version | Role | Risk |
|---------|---------|------|------|
| `vite` | ^6.0.5 | Build tool | ✅ Current |
| `@vitejs/plugin-react` | ^4.3.4 | React plugin | ✅ Matches Vite |
| `vite-plugin-electron` | ^2.3.0 | Electron integration | ⚠️ Vite 6 compat? |
| `vite-plugin-electron-renderer` | ^2.4.0 | Renderer integration | ⚠️ Vite 6 compat? |
| `tailwindcss` | ^3.4.17 | CSS framework | ✅ v3 stable (v4 exists) |
| `typescript` | ^5.7.2 | Type checking | ✅ Current |
| `electron-builder` | ^25.1.8 | Packaging | ✅ Current |
| `vitest` | ^2.1.9 | Testing | ✅ Current |
| `concurrently` | ^9.1.0 | Parallel processes | ✅ Utility |
| `wait-on` | ^8.0.1 | Wait for port | ✅ Utility |

### 1.3 Electron External Modules (not bundled)

| Package | Purpose | Loaded At |
|---------|---------|-----------|
| `electron` | Electron runtime | Runtime (built-in) |
| `electron-updater` | Auto-updater | Runtime (npm) |
| `steam-user` | Steam client protocol | Runtime (npm) |
| `depot-downloader-js` | Depot download | Runtime (npm) |
| `lzma` | LZMA compression | Runtime (native) |
| `lzma-native` | LZMA compression (native) | Runtime (native) |

**Note**: `steam-user`, `depot-downloader-js`, `lzma`, `lzma-native` are listed as external in Vite config but not in `package.json` dependencies. They must be installed separately or are expected to be in `node_modules` at runtime.

---

## 2. API Package (`@y-core/api`)

### 2.1 Production Dependencies

| Package | Version | Role | Risk |
|---------|---------|------|------|
| `fastify` | ^4.28.1 | Web framework | ✅ v4 stable (v5 exists) |
| `@fastify/cors` | ^9.0.1 | CORS handling | ✅ Matches Fastify v4 |
| `@fastify/jwt` | ^8.0.1 | JWT auth | ✅ Matches Fastify v4 |
| `@fastify/rate-limit` | ^9.1.0 | Rate limiting | ✅ Matches Fastify v4 |
| `@supabase/supabase-js` | ^2.108.2 | Supabase client | ✅ Current v2 |
| `resend` | ^3.5.0 | Email service | ✅ Current |
| `unzipper` | ^0.12.5 | ZIP extraction | ⚠️ See note below |
| `zod` | ^3.23.8 | Schema validation | ✅ v3 stable (v4 exists) |
| `dotenv` | ^17.4.2 | Environment variables | ✅ Current |
| `fastify-plugin` | ^4.5.1 | Fastify plugin helper | ✅ Matches Fastify v4 |

### 2.2 Dev Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@types/node` | ^20.14.0 | Node.js types |
| `@types/unzipper` | ^0.10.11 | Unzipper types |
| `tsx` | ^4.16.0 | TS execution (dev) |
| `typescript` | ^5.5.0 | Type checking |
| `vitest` | ^2.1.9 | Testing |

### 2.3 `unzipper` Security Note

`unzipper` is a pure-JavaScript ZIP extraction library. It's used in `apps/api/src/lib/extract.ts` for DepotBox ZIP files. Alternative: `yauzl` (also pure JS) or Node.js built-in (no built-in ZIP as of Node 20).

---

## 3. Shared Package (`@y-core/shared`)

### 3.1 Dependencies

| Package | Version | Role |
|---------|---------|------|
| `typescript` | ^5.5.0 | Type checking (dev) |

**No runtime dependencies** — the shared package is pure TypeScript types and a Lua parser with no external imports.

---

## 4. Dependency Graph

```
Root (Electron + Renderer)
├── @y-core/shared (workspace)
├── electron
├── react / react-dom
├── react-router-dom
├── zustand
├── framer-motion
├── lucide-react
├── electron-updater
└── [dev] vite, tailwindcss, vitest, electron-builder

@y-core/api
├── @y-core/shared (workspace)
├── fastify + @fastify/cors, jwt, rate-limit
├── @supabase/supabase-js
├── resend
├── unzipper
├── zod
├── dotenv
└── [dev] tsx, vitest

@y-core/shared
└── [dev] typescript
```

---

## 5. Version Compatibility Matrix

| Stack | Current | Latest Available | Status |
|-------|---------|-----------------|--------|
| Node.js | 20 (CI) | 22 LTS | ✅ Supported |
| Electron | 33 | 33 | ✅ Current |
| React | 18.3 | 19 | ✅ Stable (19 optional) |
| Vite | 6.0 | 6.x | ✅ Current |
| Fastify | 4.28 | 5.x | ⚠️ v5 available (breaking changes) |
| TypeScript | 5.7 | 5.7 | ✅ Current |
| TailwindCSS | 3.4 | 4.0 | ⚠️ v4 available (new engine) |
| Zod | 3.23 | 4.x | ⚠️ v4 available (breaking changes) |
| Supabase JS | 2.108 | 2.x | ✅ Current |

---

## 6. Native Dependencies

| Dependency | Type | Location | Purpose |
|------------|------|----------|---------|
| `lzma` / `lzma-native` | Native addon | Electron external | LZMA decompression for Steam manifests |
| `system.pem` | Data file | Copied to dist-electron | Steam crypto system public key |
| `YCoreTool.dll` | Native DLL | `native/` | Steam hook DLL |
| `dwmapi.dll` | Native DLL | `native/` | DLL hook for DWM |
| `xinput1_4.dll` | Native DLL | `native/` | DLL hook for XInput |
| `steamtools_hook.dll` | Native DLL | `native/` | Steam tools hook |

### Native DLL Installation

```
installHookDll(steamPath, mode) →
  1. Check if DLLs already installed (YCoreTool.dll exists in Steam dir)
  2. If not: show confirmation dialog to user
  3. Backup existing DLLs (rename to .bak)
  4. Copy from native/opensteamtool/ (release) or native/opensteamtool-debug/ (debug)
  5. Copy YCoreTool.dll, dwmapi.dll, xinput1_4.dll to Steam directory
```

---

## 7. Peer/Implicit Dependencies

| Package | Expected By | In package.json? | Risk |
|---------|-------------|------------------|------|
| `steam-user` | Electron main.ts | ❌ Not in deps | ⚠️ Must be installed separately |
| `depot-downloader-js` | Electron main.ts | ❌ Not in deps | ⚠️ Must be installed separately |
| `lzma` | Electron (external) | ❌ Not in deps | ⚠️ Native build required |
| `lzma-native` | Electron (external) | ❌ Not in deps | ⚠️ Native build required |

**These are listed as `external` in Vite config but not declared as dependencies.** This means:
- Dev mode: They must be in `node_modules` (hoisted or installed manually)
- Production: They must be present alongside the Electron executable
- CI: `pnpm install` won't install them → typecheck may fail

---

## 8. Build Tool Chain

```
pnpm (package manager)
  └── pnpm-workspace.yaml
        ├── apps/* (API)
        └── packages/* (shared)

Vite (bundler)
  ├── Renderer: React + TailwindCSS → dist/
  └── Electron: main.ts, preload.ts, splash-preload.ts → dist-electron/

electron-builder (packager)
  ├── Windows NSIS installer
  ├── Auto-update via GitHub releases
  └── Includes: dist-electron/, dist/, native/, tools/, build/

TypeScript (type checker)
  ├── Root tsconfig.json (renderer + electron)
  ├── apps/api/tsconfig.json (API)
  └── packages/shared/tsconfig.json (shared)
```

---

## 9. Dependency Security Assessment

| Risk | Package | Issue | Recommendation |
|------|---------|-------|----------------|
| ⚠️ Medium | `unzipper` | Pure JS, no path traversal protection in extract | Validate extracted paths |
| ⚠️ Low | `vite-plugin-electron` | Vite 6 compatibility not confirmed | Test on Vite 6 |
| ⚠️ Low | Missing native deps | `steam-user`, `lzma` not in package.json | Add to optionalDependencies |
| ✅ None | `fastify` v4 | Well-maintained, security patches | Consider v5 migration |
| ✅ None | `@supabase/supabase-js` | Official SDK | Keep current |
| ✅ None | `zod` v3 | Stable validation | Consider v4 when stable |

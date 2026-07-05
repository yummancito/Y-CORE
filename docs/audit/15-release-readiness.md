# Y-Core Technical Audit — Phase 15: Release Readiness

## Overview

Final assessment of release readiness covering code quality, testing, CI/CD, documentation, deployment, and a prioritized action plan.

---

## 1. Code Quality

### 1.1 TypeScript Strictness

| Area | Status | Issues |
|------|--------|--------|
| Root tsconfig | Not read (assumed strict) | — |
| Electron tsconfig | Exists (`electron/tsconfig.json`) | ⚠️ 22+ lint errors in `main.ts` |
| API tsconfig | Exists | ✅ Clean |
| Shared tsconfig | Exists | ✅ Clean |

### 1.2 Lint Errors in `electron/main.ts`

22+ TypeScript errors reported by the IDE:
- **Implicit `any` types**: Parameters `a`, `m`, `k`, `d` in multiple arrow functions (lines 1747, 1769, 1776, 1824, 1828, 1829, 1856, 2326, 2341, 2461, 2462)
- **Type mismatch**: `Set<unknown>` not assignable to `Set<string>` (lines 1882, 2342)
- **Additional errors**: 6+ more truncated

**Impact**: These errors indicate missing type annotations in IPC handler callbacks. The code likely works at runtime (JavaScript is permissive), but type safety is compromised.

**Recommendation**: Add explicit type annotations to all callback parameters. Import shared types from `@y-core/shared` and `electron/modules/types.ts`.

### 1.3 Code Organization

| Aspect | Rating | Notes |
|--------|--------|-------|
| Module separation | ✅ Good | Electron modules, API libs, shared package |
| File sizes | ⚠️ `main.ts` is 2964 lines | Should be split further |
| Naming conventions | ✅ Consistent | kebab-case files, camelCase functions |
| Import structure | ✅ Clean | Workspace imports, no circular deps detected |
| Error handling | ✅ Consistent | try/catch with logger, error objects returned |
| Dead code | ⚠️ Unknown | No dead code analysis performed |

### 1.4 `main.ts` Size Concern

At 2964 lines, `electron/main.ts` is the largest file in the project. It contains:
- Window creation (splash, login, main)
- ~42 IPC handlers
- Steam image fetching with 4 fallbacks
- Manifest/Lua import/export
- Store install logic
- DepotBox install logic
- Hook DLL installation
- ACF watcher
- Auto-updater setup
- Token refresh logic

**Recommendation**: Extract remaining IPC handlers into modules (e.g., `modules/store.ts`, `modules/depotbox.ts`, `modules/steam-images.ts`, `modules/updater.ts`).

---

## 2. Testing

### 2.1 Current Test Coverage

| Area | Test Status | Framework |
|------|-------------|-----------|
| Root (renderer) | ⚠️ `vitest run` configured | No test files found |
| API | ⚠️ `vitest run` configured | No test files found |
| Shared | ⚠️ No test script | No test files found |
| Electron | ❌ No test script | — |

**Risk**: Zero test coverage across the entire project. CI runs `pnpm test` but there are no test files to execute.

### 2.2 Recommended Test Priorities

| Priority | Area | Type | Key Tests |
|----------|------|------|-----------|
| 1 | Lua parser | Unit | `parseLuaScript()` with various inputs |
| 2 | Auth routes | Integration | Register, login, refresh, logout |
| 3 | ACF generation | Unit | `generateAcfContent()`, `patchAcfForDownload()` |
| 4 | Depot key injection | Unit | `injectDepotKeysIntoConfigVdf()` |
| 5 | API install flow | Integration | Ready vs queued, rate limiting |
| 6 | VDF parser | Unit | `parseVdf()` with real ACF files |
| 7 | Token refresh | Unit | `createRefreshToken()`, `validateRefreshToken()` |
| 8 | OnlineFix | Unit | Enable/disable/status ACF modification |
| 9 | GoldSrc handling | Unit | `ensureGoldSrcBaseDepots()` |
| 10 | Search | Integration | Combined catalog + DepotBox |

---

## 3. CI/CD

### 3.1 Current CI Pipeline

```
GitHub Actions (.github/workflows/ci.yml) →
  Job 1: test
    - pnpm install --frozen-lockfile
    - pnpm typecheck (root)
    - pnpm test (root)

  Job 2: api-typecheck
    - pnpm install --frozen-lockfile
    - pnpm --filter @y-core/api typecheck
    - pnpm --filter @y-core/api test
    - pnpm --filter @y-core/shared typecheck
```

### 3.2 CI Gaps

| Gap | Risk | Recommendation |
|-----|------|----------------|
| No lint step | Code style drift | Add `pnpm lint` (eslint) |
| No build step | Build errors not caught | Add `pnpm build` |
| No Electron typecheck | `main.ts` errors not caught | Add electron typecheck job |
| No security audit | Vulnerable deps not detected | Add `pnpm audit` |
| No coverage report | Unknown coverage | Add coverage reporting |
| No e2e tests | Integration not verified | Add Playwright tests |
| No deploy step | Manual deployment | Add CD pipeline |

### 3.3 Recommended CI Pipeline

```
Job 1: lint
  - pnpm lint (eslint, all packages)

Job 2: typecheck
  - pnpm typecheck (root + electron)
  - pnpm --filter @y-core/api typecheck
  - pnpm --filter @y-core/shared typecheck

Job 3: test
  - pnpm test (all packages)
  - Upload coverage report

Job 4: build
  - pnpm build (renderer)
  - pnpm --filter @y-core/api build
  - Verify build artifacts exist

Job 5: security
  - pnpm audit --audit-level=moderate

Job 6: e2e (optional)
  - pnpm electron:build
  - Run Playwright smoke tests
```

---

## 4. Documentation

### 4.1 Current Documentation

| Document | Location | Status |
|----------|----------|--------|
| READMEs | `src/pages/README.md`, `src/components/README.md`, `src/lib/README.md`, `src/stores/README.md`, `electron/README.md` | ✅ Exist |
| API docs | None | ❌ Missing |
| Setup guide | None | ❌ Missing |
| Env vars | None | ❌ Missing |
| Architecture | This audit | ✅ Being created |
| DB schema | Migration files only | ❌ No ERD diagram |
| IPC reference | This audit | ✅ Phase 09 |
| API reference | This audit | ✅ Phase 10 |

### 4.2 Recommended Documentation

| Priority | Document | Content |
|----------|----------|---------|
| 1 | SETUP.md | Dev setup, env vars, commands |
| 2 | .env.example | Template for all env vars |
| 3 | ARCHITECTURE.md | High-level architecture diagram |
| 4 | CONTRIBUTING.md | Code style, PR process |
| 5 | DEPLOYMENT.md | API deployment, Electron packaging |
| 6 | CHANGELOG.md | Version history |

---

## 5. Deployment

### 5.1 API Deployment

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Platform | Render.com (implied by self-ping) | ✅ Adequate |
| Build | `tsc` → `node dist/index.js` | ✅ Standard |
| Env vars | Manual configuration | Document all required vars |
| Health check | `GET /health` | ✅ Implemented |
| Keep-alive | Self-ping interval | ✅ Implemented |
| Logging | Fastify logger | ✅ Configurable |

### 5.2 Electron Deployment

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Target | Windows x64 NSIS | ✅ Defined |
| Auto-update | GitHub releases via electron-updater | ✅ Configured |
| Code signing | Not configured | ⚠️ See below |
| Notarization | N/A (Windows only) | — |
| Assets | `build/icon.ico` | ✅ Exists |

**Risk**: No code signing. Windows SmartScreen will warn users about unsigned executables.

**Recommendation**: Obtain an EV code signing certificate for production releases.

### 5.3 Database Deployment

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Platform | Supabase | ✅ Managed |
| Migrations | Manual SQL files | ⚠️ No migration runner |
| Backup | Supabase managed | ✅ Automatic |
| RLS | Enabled | ✅ Defense in depth |

**Risk**: Migrations are manual SQL files with no version tracking or automated execution. Two files share the `002_` prefix.

**Recommendation**: Use Supabase CLI or a migration tool (e.g., `supabase db push`) for automated migrations.

---

## 6. Environment Configuration

### 6.1 Missing `.env.example`

No `.env.example` file exists in the repository. New developers must guess required environment variables.

**Recommendation**: Create `.env.example` files for:
- Root (Electron): `VITE_YCORE_API_URL`
- API: All server-side env vars
- Document which are required vs optional

### 6.2 Environment Variable Validation

`apps/api/src/lib/config.ts` validates env vars but only enforces required vars in production mode. In development, missing vars are silently ignored.

**Recommendation**: Always validate required vars and provide clear error messages.

---

## 7. Release Readiness Checklist

### 7.1 Blockers (Must Fix Before Release)

| # | Item | Status | Effort |
|---|------|--------|--------|
| 1 | TypeScript errors in `main.ts` | ❌ 22+ errors | Medium |
| 2 | No test coverage | ❌ Zero tests | High |
| 3 | No `.env.example` | ❌ Missing | Low |
| 4 | No rate limit on auth endpoints | ❌ Missing | Low |
| 5 | Password reset brute-force protection | ❌ Missing | Low |
| 6 | DepotBox API key in client | ❌ Security risk | Medium |

### 7.2 Important (Should Fix Before Release)

| # | Item | Status | Effort |
|---|------|--------|--------|
| 7 | Code signing for Windows | ❌ Missing | Medium (cost) |
| 8 | CSP `unsafe-inline` removal | ⚠️ Present | Medium |
| 9 | CI pipeline gaps (lint, build, audit) | ⚠️ Partial | Low |
| 10 | Missing native deps in package.json | ⚠️ Missing | Low |
| 11 | `main.ts` too large (2964 lines) | ⚠️ Monolith | Medium |
| 12 | No migration runner | ⚠️ Manual | Low |
| 13 | Store catalog pagination | ⚠️ 1000 games at once | Medium |
| 14 | SteamSpy result caching | ⚠️ No cache | Low |
| 15 | Sandbox mode disabled | ⚠️ Not set | Trivial |

### 7.3 Nice to Have (Post-Release)

| # | Item | Status | Effort |
|---|------|--------|--------|
| 16 | E2E tests with Playwright | ❌ Missing | High |
| 17 | API documentation (OpenAPI) | ❌ Missing | Medium |
| 18 | Setup guide | ❌ Missing | Low |
| 19 | Bundle size monitoring | ❌ Missing | Low |
| 20 | WebSocket for job polling | ❌ Polling | High |
| 21 | Virtual scrolling for large lists | ❌ Missing | Medium |
| 22 | LRU limit on image cache | ❌ Unbounded | Low |
| 23 | Refresh token expiry reduction | ⚠️ 30 days | Trivial |
| 24 | Fine-grained GitHub PAT | ⚠️ Broad scope | Low |
| 25 | Coverage reporting in CI | ❌ Missing | Low |

---

## 8. Risk Matrix

| Risk | Probability | Impact | Score | Mitigation |
|------|------------|--------|-------|------------|
| Auth brute-force | High | High | **9** | Add rate limits (Blocker) |
| DepotBox key extraction | Medium | High | **6** | Route through API (Blocker) |
| TypeScript runtime error | Medium | Medium | **4** | Fix lint errors (Blocker) |
| Stale game cache | Low | Low | **1** | Add TTL (Post-release) |
| Memory leak (images) | Low | Medium | **2** | LRU cache (Nice to have) |
| Build failure (missing deps) | Medium | High | **6** | Add to package.json (Important) |
| SmartScreen warning | High | Medium | **6** | Code signing (Important) |
| Migration ordering | Low | Medium | **2** | Migration runner (Important) |

---

## 9. Prioritized Action Plan

### Sprint 1 (Blockers — 1-2 weeks)

1. **Fix TypeScript errors in `main.ts`** — Add type annotations to all callback parameters
2. **Add auth rate limits** — Login: 10/10min, Register: 5/hour, Forgot: 5/hour, Reset: 10/hour
3. **Add password reset attempt tracking** — Lockout after 5 failed attempts
4. **Remove DepotBox API key from Electron** — Route all DepotBox calls through API
5. **Create `.env.example` files** — Document all env vars
6. **Write critical unit tests** — Lua parser, VDF parser, ACF generation, auth routes

### Sprint 2 (Important — 2-3 weeks)

7. **Add ESLint to CI** — Consistent code style
8. **Add build step to CI** — Catch build errors
9. **Add missing native deps** — `steam-user`, `lzma` in optionalDependencies
10. **Enable sandbox mode** — `sandbox: true` in webPreferences
11. **Split `main.ts`** — Extract store, depotbox, updater, steam-images into modules
12. **Tighten CSP** — Remove `unsafe-inline` in production
13. **Add store catalog pagination** — Reduce initial payload
14. **Cache SteamSpy results** — Persist to disk in Electron

### Sprint 3 (Polish — 2-4 weeks)

15. **Obtain code signing certificate** — Sign Windows builds
16. **Add migration runner** — Supabase CLI integration
17. **Add API documentation** — OpenAPI/Swagger
18. **Write setup guide** — SETUP.md with dev instructions
19. **Add coverage reporting** — Istanbul/c8 in CI
20. **Parallelize manifest downloads** — Concurrency limit in Electron
21. **Add LRU to image cache** — Prevent unbounded growth
22. **Reduce refresh token expiry** — 30 days → 7 days

---

## 10. Final Verdict

### Release Readiness Score

| Category | Score | Notes |
|----------|-------|-------|
| Functionality | 8/10 | Core features work, flows are complete |
| Security | 5/10 | Good foundation, but missing rate limits and key issues |
| Code Quality | 6/10 | Well-organized but TypeScript errors and monolithic main.ts |
| Testing | 1/10 | Zero test coverage |
| CI/CD | 4/10 | Basic typecheck only, no lint/build/audit |
| Documentation | 3/10 | READMEs exist but no setup guide or API docs |
| Deployment | 5/10 | Config exists but no code signing or migration runner |
| Performance | 7/10 | Good caching, but some large payloads and unbounded caches |

### Overall: **Not Ready for Production Release**

The application is functionally complete with well-designed architecture and flows. However, it cannot be recommended for production release until:

1. **Security blockers are resolved** (auth rate limits, DepotBox key, reset brute-force)
2. **TypeScript errors are fixed** (22+ errors in main.ts)
3. **Minimum test coverage exists** (at least unit tests for critical paths)
4. **Environment documentation exists** (.env.example)

With the Sprint 1 items completed (estimated 1-2 weeks), the application would be at a **beta release** level. Sprint 2 items would bring it to **production-ready**.

---

## Audit Documents Index

| Phase | Document | Status |
|-------|----------|--------|
| 01 | Project Inventory | ✅ Complete |
| 02 | Startup Flow | ✅ Complete |
| 03 | Login & Auth Flow | ✅ Complete |
| 04 | Library Flow | ✅ Complete |
| 05 | Search Flow | ✅ Complete |
| 06 | DepotBox Import Flow | ✅ Complete |
| 07 | Game Installation Flow | ✅ Complete |
| 08 | Game Launch Flow | ✅ Complete |
| 09 | IPC Channel Map | ✅ Complete |
| 10 | API Route Map | ✅ Complete |
| 11 | Database Schema | ✅ Complete |
| 12 | Dependency Map | ✅ Complete |
| 13 | Security Assessment | ✅ Complete |
| 14 | Performance Assessment | ✅ Complete |
| 15 | Release Readiness | ✅ Complete |

# Y-Core Technical Audit — Phase 14: Performance Assessment

## Overview

Analysis of performance characteristics, bottlenecks, caching strategies, and optimization opportunities across the Y-Core application.

---

## 1. Startup Performance

### 1.1 Measured Timeline (Estimated)

| Phase | Time | Bottleneck |
|-------|------|------------|
| Electron launch | 200ms | Runtime initialization |
| Splash window | 150ms | Window creation + HTML load |
| Auth check | 50ms | localStorage read + JWT parse |
| Vite dev server (dev) | 200ms | HTTP round-trip |
| React bootstrap | 100ms | Theme + language detection |
| Auth init | 100ms | localStorage + IPC sync |
| First render | 100ms | ProtectedRoute + LibraryPage |
| App ready signal | 100ms | Delayed by 100ms intentionally |
| **Total (dev)** | **~1.0s** | |
| **Total (prod)** | **~0.7s** | No Vite dev server |

### 1.2 Startup Optimizations

| Optimization | Status | Impact |
|-------------|--------|--------|
| Splash screen during load | ✅ Implemented | Perceived performance |
| Hidden main window until ready | ✅ Implemented | No flash of unstyled content |
| Config cached in Electron | ✅ `ycore-config.json` | Fast theme/language load |
| 100ms delay before showing window | ✅ | Smooth transition |

---

## 2. Library Performance

### 2.1 Game List Loading

```
steam:listInstalledGames →
  1. Check _gamesCache (in-memory)
  2. If cache miss:
     a. Read libraryfolders.vdf
     b. For each library folder:
        - Read all appmanifest_*.acf files
        - Parse each VDF
     c. Build InstalledGame[] array
     d. Cache in _gamesCache
  3. Return cached or fresh result
```

**Performance characteristics**:
- First load: O(n) where n = number of installed games
- Cached load: O(1) — instant return
- Cache invalidation: Set to `null` on install/delete/import

**Risk**: No TTL on `_gamesCache`. If a user manually adds/removes games via Steam (not Y-Core), the cache is stale until app restart or explicit invalidation.

### 2.2 Store Image Loading

```
steam:getStoreImage(appId) →
  1. Check storeImageCache (Map)
  2. If miss: try 4 fallback sources sequentially
  3. Cache result (including failures)
```

**Performance characteristics**:
- First load per app: Up to 4 HTTP requests (worst case)
- Cached: O(1) Map lookup
- Cache size: Unbounded — grows with unique app IDs

**Risk**: `storeImageCache` is never cleared. For users with large libraries, this could consume significant memory.

**Recommendation**: Add LRU eviction or size limit to `storeImageCache`.

### 2.3 ACF Watcher

```
Runs every 30 seconds:
  - Reads all ACF files in all library folders
  - Checks if repair is needed
```

**Performance**: O(n) every 30 seconds where n = number of games. For typical libraries (<100 games), this is negligible. For large libraries (500+), could cause I/O pressure.

**Recommendation**: Increase interval to 60 seconds or make it configurable.

---

## 3. Store Performance

### 3.1 Catalog Loading

```
StorePage (discover tab) →
  1. Check gamesCacheRef (renderer, 5-min TTL)
  2. If miss: GET /api/games?limit=1000
  3. Client-side: dedup, filter installed, filter NSFW
  4. Build category sections
  5. Cache result
```

**Performance characteristics**:
- API: Supabase query with LIMIT 1000
- Client: O(n) filtering and categorization
- Cache: 5-minute TTL, invalidated on tab switch

**Risk**: Fetching 1000 games at once is a large payload. The response includes all GameSummary fields for each game.

**Recommendation**: Implement pagination or virtual scrolling for the browse tab. The discover tab only shows 30 per category, so fetching 1000 is wasteful if categories are sparse.

### 3.2 Search Performance

```
doSearch(query) →
  1. 400ms debounce
  2. GET /api/search?q=...&limit=50
  3. API: parallel Supabase + DepotBox search
  4. Client: split catalog/depotbox, filter, type-check
  5. SteamSpy batch type checking (5 apps per batch, 200ms delay)
```

**Performance characteristics**:
- API response: ~200-500ms (parallel queries)
- SteamSpy type checking: 50 apps × (5s timeout + 200ms delay) / 5 batch = ~54s worst case
- AbortController: Previous search aborted on new input

**Risk**: SteamSpy type checking for 50 DepotBox results can take up to 54 seconds in the worst case. Results appear progressively (catalog first, then filtered depotbox).

**Recommendation**: Cache SteamSpy results in Electron (persisted to disk) to avoid re-checking the same app IDs on subsequent searches.

### 3.3 Store Page Rendering

| Component | Optimization | Status |
|-----------|-------------|--------|
| `GameCard` | `memo()` wrapped | ✅ Prevents re-render |
| `Card3D` | CSS transforms | ✅ GPU accelerated |
| `CoverImage` | Lazy loading? | ⚠️ Not confirmed |
| Category sections | `useMemo` | ✅ Memoized |
| Search results | `AbortController` | ✅ Cancelled on new input |

---

## 4. API Performance

### 4.1 Database Queries

| Query | Table | Index Used | Performance |
|-------|-------|-----------|-------------|
| Search games | `games` | `idx_games_name` (GIN full-text) | ✅ Fast |
| List games | `games` + `game_categories` | Various | ✅ Indexed |
| Game details | `games` | `idx_games_app_id` | ✅ Unique index |
| Manifests | `manifests` | `idx_manifests_app_id` | ✅ Indexed |
| Depot keys | `game_depot_keys` | `idx_depot_keys_app_id` | ✅ Indexed |
| Job status | `import_jobs` | `idx_jobs_user` | ✅ Indexed |
| Install rate limit | `install_requests` | `idx_install_requests_user` | ✅ Indexed |

### 4.2 DepotBox Import Performance

```
processDepotBoxImport →
  1. initiateDownload: 1 API call (~200ms)
  2. waitForDownloadReady: up to 60 polls × 3s = 180s max
  3. downloadZip: 1 HTTP GET (variable, depends on game size)
  4. extractZip: O(zip size) in memory
  5. parseLuaScript: O(lua content length)
  6. fetchSteamAppDetails: 1 API call (~500ms)
  7. UPSERT game: 1 DB call
  8. UPSERT manifests: N DB calls (N = manifest count)
  9. GitHub upload Lua: 2 API calls (check + PUT)
  10. GitHub upload manifests: 2N API calls (check + PUT per file)
  11. UPSERT depot keys: M DB calls (M = key count)
```

**Total time**: 30 seconds to 3+ minutes depending on DepotBox processing time and game size.

**Risk**: All operations are sequential. GitHub uploads are particularly slow (2 calls per file).

**Recommendation**: Parallelize GitHub manifest uploads. Batch Supabase UPSERTs.

### 4.3 Manifest Download

```
GET /api/manifests/:app_id/:depot_id/:manifest_gid →
  1. DB check: ~10ms
  2. GitHub raw fetch: ~200-500ms
  3. Return binary
```

**Performance**: Acceptable for individual downloads. For games with many manifests (10+), downloads are sequential in Electron.

**Recommendation**: Parallelize manifest downloads in Electron (with concurrency limit).

---

## 5. Bundle Size Analysis

### 5.1 Renderer Bundle

| Category | Estimated Size | Notes |
|----------|---------------|-------|
| React + ReactDOM | ~45 KB gzipped | Production build |
| React Router | ~15 KB gzipped | |
| Zustand | ~3 KB gzipped | Minimal |
| Framer Motion | ~30 KB gzipped | Tree-shakeable |
| Lucide React | ~5 KB gzipped | Per-icon import |
| i18n.ts | ~25 KB gzipped | 80 KB source — es/en strings |
| Application code | ~50 KB gzipped | Estimated |
| **Total** | **~173 KB gzipped** | Estimated |

### 5.2 Electron Main Bundle

| Category | Estimated Size | Notes |
|----------|---------------|-------|
| main.ts (compiled) | ~200 KB | 2964 lines → CJS bundle |
| Modules | ~50 KB | All modules combined |
| **Total** | **~250 KB** | Before external deps |

### 5.3 API Bundle

| Category | Estimated Size | Notes |
|----------|---------------|-------|
| Fastify + plugins | External | node_modules |
| Application code | ~100 KB | All routes + libs |
| **Total** | **~100 KB** | Application code only |

---

## 6. Memory Usage

### 6.1 Electron Main Process

| Consumer | Size | Growth |
|----------|------|--------|
| `storeImageCache` | Unbounded | ⚠️ Grows with unique app IDs |
| `_gamesCache` | O(n) games | ✅ Fixed per session |
| `inMemoryLogs` | Max 500 entries | ✅ Bounded |
| `authSession` | ~1 KB | ✅ Fixed |
| Native DLLs | Loaded by Steam | External |

### 6.2 Renderer Process

| Consumer | Size | Growth |
|----------|------|--------|
| React component tree | O(visible games) | ✅ Virtual DOM |
| `gamesCacheRef` | O(1000) games | ⚠️ 5-min TTL |
| `compatCache` | O(batch size) | ✅ 1-min TTL |
| Zustand stores | Small | ✅ Fixed |
| Images in DOM | O(visible cards) | ✅ Browser managed |

---

## 7. Network Performance

### 7.1 API Calls per User Action

| Action | API Calls | External Calls |
|--------|-----------|----------------|
| Login | 1 | 1 (Supabase Auth) |
| Register | 1 | 1 (Supabase Auth) |
| Load store | 1 (list 1000 games) | 0 |
| Search | 1 (combined search) | 1 (DepotBox) + N/5 (SteamSpy) |
| Install (ready) | 2 (install + downloaded) | 1 (GitHub Lua) |
| Install (queued) | 2 + N polls (install + job polls) | DepotBox + GitHub |
| Library load | 0 (IPC only) | 0 |

### 7.2 Payload Sizes

| Endpoint | Request | Response | Notes |
|----------|---------|----------|-------|
| List games | ~100 bytes | ~200 KB (1000 games) | ⚠️ Large |
| Search | ~200 bytes | ~10 KB (50 results) | ✅ Reasonable |
| Install (ready) | ~100 bytes | ~5-50 KB | Lua content + metadata |
| Job status | ~100 bytes | ~2 KB | ✅ Small |
| Manifest download | ~100 bytes | Variable | Binary file |

---

## 8. Optimization Recommendations

### 8.1 High Priority

| # | Optimization | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Paginate store catalog | Reduces payload from 200KB to 20KB | Medium |
| 2 | Cache SteamSpy results to disk | Eliminates repeated API calls | Low |
| 3 | Parallelize manifest downloads | 3-5x faster install for multi-manifest games | Low |
| 4 | Add LRU limit to storeImageCache | Prevents unbounded memory growth | Low |

### 8.2 Medium Priority

| # | Optimization | Impact | Effort |
|---|-------------|--------|--------|
| 5 | Batch Supabase UPSERTs in import | Reduces DB round-trips | Low |
| 6 | Parallelize GitHub uploads | Faster import completion | Medium |
| 7 | Virtual scrolling for large lists | Smooth scrolling with 500+ games | Medium |
| 8 | Increase ACF watcher interval | Reduces I/O pressure | Trivial |
| 9 | Add TTL to _gamesCache | Prevents stale data | Trivial |

### 8.3 Low Priority

| # | Optimization | Impact | Effort |
|---|-------------|--------|--------|
| 10 | Lazy load route components | Faster initial bundle | Low |
| 11 | Code-split i18n | Smaller initial bundle | Medium |
| 12 | Prefetch store catalog on login | Instant store load | Low |
| 13 | WebSocket for job polling | Eliminates polling overhead | High |
| 14 | Image lazy loading in cards | Reduces initial image loads | Low |

---

## 9. Performance Monitoring

### 9.1 Current Monitoring

| Metric | Location | Status |
|--------|----------|--------|
| Log entries with timing | `StorePage.tsx` | ✅ `[Perf]` log messages |
| Splash status with percent | `StorePage.tsx` | ✅ Visual feedback |
| DepotBox poll timing | `depotbox.ts` | ✅ Configurable intervals |

### 9.2 Missing Monitoring

| Metric | Recommendation |
|--------|----------------|
| API response times | Add Fastify timing middleware |
| DB query times | Enable Supabase query logging |
| Electron IPC timing | Add timing wrapper for IPC handlers |
| Memory usage tracking | Log process.memoryUsage() periodically |
| Bundle size tracking | Add `size-limit` to CI |

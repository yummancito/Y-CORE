# Y-Core Technical Audit — Phase 05: Search Flow

## Overview

This document traces the search flow: how users search for games in the store, combining results from the Supabase catalog and DepotBox, with client-side type checking via SteamSpy.

---

## 1. Search Entry Point (`src/pages/StorePage.tsx`)

### 1.1 Search Input

```
User types in search bar →
  1. setQuery(value) — update query state
  2. useEffect with 400ms debounce →
     doSearch(query)
```

### 1.2 Search Trigger

```
doSearch(q) →
  1. If q.trim().length < 2: clear results, return
  2. Abort previous search (AbortController)
  3. setSearching(true)
  4. Call API: searchGamesCombined(q, 50, filterNsfw)
  5. Process results (see below)
  6. setSearching(false)
```

---

## 2. API Search Endpoint (`apps/api/src/routes/games.ts:81-148`)

### 2.1 `GET /api/search`

```
GET /api/search?q={query}&limit={limit}&filter_nsfw={exclude|only|all} →
  1. Validate: q must be at least 2 chars
  2. searchLimit = min(parseInt(limit || '50'), 100)
  3. Parallel execution:

     a. Supabase catalog search:
        SELECT id, app_id, name, header_image_url, is_available, source
        FROM games
        WHERE is_available = true
          AND name ILIKE '%{q}%'
        LIMIT searchLimit

     b. DepotBox search (if DEPOTBOX_API_KEY configured):
        POST https://depotbox.org/api/search-games
        Body: { searchTerm, limit, offset, filter_dlc, filter_availability, filter_nsfw }
        → Returns: { games: [{ appid, name, is_dlc, header_image_url }], hasMore }

  4. Merge results:
     a. Add Supabase results first (priority)
     b. Add DepotBox results not already seen (dedup by app_id)
  5. Return:
     {
       games: [{ app_id, name, header_image_url, source, is_dlc? }],
       total: number,
       sources: { catalog: count, depotbox: count }
     }
```

### 2.2 Result Sources

| Source | Origin | Data Available |
|--------|--------|----------------|
| `catalog` | Supabase `games` table | Full game data (name, image, description, etc.) |
| `depotbox` | DepotBox API | Basic data (appid, name, header_image, is_dlc) |

---

## 3. Client-Side Result Processing (`StorePage.tsx:414-492`)

### 3.1 Result Separation

```
1. Split results into:
   - catalogGames: source === 'catalog'
   - depotboxGames: source === 'depotbox'

2. Filter catalog games:
   - Remove installed games (installedAppIds check)
   - Filter NSFW if showAdult === false (category-based)

3. If showTools && showAdult:
   → Skip type checking, show all DepotBox results
   → setSearchResults([...filteredCatalog, ...filteredDepotbox])
   → Return early

4. Otherwise: Show catalog results immediately
   → setSearchResults(filteredCatalog)
   → Then check DepotBox app types asynchronously
```

### 3.2 DepotBox App Type Checking

```
1. Collect depotboxAppIds from depotboxGames
2. If no depotboxAppIds: return (catalog results already shown)
3. Call: window.steamtools.checkAppTypes(depotboxAppIds)
   → IPC: steam:checkAppTypes
```

### 3.3 `steam:checkAppTypes` IPC Handler (`main.ts:2720-2776`)

```
steam:checkAppTypes(appIds) →
  1. Define TOOL_PATTERNS regex:
     - Dedicated Server, SDK, Editor, Runtime, Redist, etc.
  2. Define ADULT_TAGS regex:
     - Sexual Content, Nudity, Adult Only, Hentai, etc.
  3. Process in batches of 5 (rate limiting):
     For each appId in batch:
       a. Fetch from SteamSpy API:
          GET https://steamspy.com/api.php?request=appdetails&appid={appId}
          Timeout: 5 seconds
       b. If API fails or no data: allow as game (isGame=true, isAdult=false)
       c. Check name against TOOL_PATTERNS → isGame = !isTool
       d. Check tags + name against ADULT_TAGS → isAdult
       e. Store result: { isGame, isAdult }
     200ms delay between batches
  4. Return: Record<appId, { isGame, isAdult }>
```

### 3.4 Final Filtering

```
1. Filter depotboxGames:
   - If !showAdult && category is NSFW: exclude
   - If !showTools && !info.isGame: exclude (it's a tool)
   - If info.isAdult && !showAdult: exclude
   - Remove installed games

2. Merge: setSearchResults([...filteredCatalog, ...filteredDepotbox])
```

---

## 4. Search State

| State | Type | Purpose |
|-------|------|---------|
| `query` | `string` | Current search input |
| `searchResults` | `MergedGame[] \| null` | null = not searching, array = results |
| `searching` | `boolean` | Loading indicator |
| `installedAppIds` | `Set<string>` | Installed app IDs (for filtering) |
| `showAdult` | `boolean` | From settings store |
| `showTools` | `boolean` | From settings store |

### MergedGame Type

```typescript
interface MergedGame {
  app_id: string
  name: string
  header_image_url?: string | null
  category?: CategoryId | null
  source: 'catalog' | 'import'
  is_dlc?: boolean
}
```

---

## 5. Search Performance

| Aspect | Value | Notes |
|--------|-------|-------|
| Debounce | 400ms | Prevents excessive API calls while typing |
| Min query length | 2 chars | Below 2 chars, results are cleared |
| Max results | 50 (default), 100 (hard cap) | From API |
| Batch size for SteamSpy | 5 apps | Rate limiting |
| SteamSpy timeout | 5 seconds per app | Fails open (allows game) |
| Batch delay | 200ms | Between SteamSpy batches |
| AbortController | Yes | Previous search aborted on new input |

---

## 6. Search Result Display

### 6.1 Search Active State

When `searchResults !== null`:
- Category tabs hidden
- Search results shown in a flat grid
- Clear button (X) shown in search bar
- Loading spinner shown while `searching === true`

### 6.2 Game Card in Search

Each result renders as a `GameCard` with:
- Cover image (from `header_image_url` or fallback)
- Game name (or "App {appId}" if generic)
- Install button
- 3D hover effect (Card3D component)
- Click → opens game detail modal (if `onSelect` provided)

### 6.3 Image Fallback Chain

```
getDefaultGameImageUrl(game) →
  1. If game.header_image_url: use it
  2. If appId is numeric: https://depotbox.org/api/images/steam-header/{appId}
  3. Fallback: getCoverUrl(appId) from domain/utils
```

---

## 7. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty query | Results cleared, normal store view shown |
| 1-char query | No search triggered (min 2 chars) |
| No results | Empty state shown |
| DepotBox API key not configured | Only Supabase catalog results returned |
| SteamSpy API down | All DepotBox results allowed (fails open) |
| Network error | Toast: "Search failed: {message}" |
| AbortController triggered | Results from previous search discarded |

---

## 8. Search Data Flow Diagram

```
User Input (400ms debounce)
       │
       ▼
  GET /api/search?q=...&limit=50&filter_nsfw=...
       │
       ├──▶ Supabase: SELECT FROM games WHERE name ILIKE '%q%'
       │         │
       │         └──▶ Catalog results (priority)
       │
       └──▶ DepotBox: POST /api/search-games
                 │
                 └──▶ DepotBox results (deduped)
       │
       ▼
  Merge & Deduplicate by app_id
       │
       ▼
  Split: catalogGames / depotboxGames
       │
       ├──▶ Filter catalog (installed, NSFW)
       │         │
       │         └──▶ Show immediately
       │
       └──▶ steam:checkAppTypes (SteamSpy, batched)
                 │
                 ▼
           Filter depotbox (tools, adult, installed)
                 │
                 ▼
           Merge with catalog results
                 │
                 ▼
           setSearchResults(finalList)
```

# Steam Workshop API - Integration Guide

## Overview

The Steam Workshop API provides access to mod metadata, search, and download capabilities. This document covers API details, rate limits, best practices, and error handling.

## API Endpoints

### Base URL
```
https://api.steampowered.com/ISteamRemoteStorage/
```

### Endpoints Used

#### GetPublishedFileDetails
Retrieve metadata for workshop items.

**Endpoint:** `GetPublishedFileDetails/v1/`

**Parameters:**
```
POST or GET
  publishedfileids         (comma-separated IDs)
  includevotes=1          (include vote counts)
  includemetadata=1       (include metadata)
  includechildren=1       (include dependencies)
  striphtml=1             (remove HTML from descriptions)
```

**Response Format:**
```json
{
  "response": {
    "result": 1,
    "resultcount": 1,
    "publishedfiledetails": [
      {
        "publishedfileid": "123456789",
        "result": 1,
        "creator": "76561198000000000",
        "creator_appid": 570,
        "title": "My Awesome Mod",
        "description": "Description here",
        "file_size": 1024000,
        "file_url": "https://steamusercontent.com/...",
        "preview_url": "https://steamusercontent.com/...",
        "filename": "mod.zip",
        "time_created": 1609459200,
        "time_updated": 1609545600,
        "visibility": 0,
        "flags": 0,
        "tags": [
          { "tag": "Gameplay" },
          { "tag": "Balance" }
        ],
        "language": "english",
        "vote_data": {
          "votes_up": 1250,
          "votes_down": 25,
          "score": 0.98
        }
      }
    ]
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| publishedfileid | string | Unique workshop item ID |
| result | number | 1=success, else=error |
| creator | string | Creator's SteamID64 |
| creator_appid | number | Game AppID |
| title | string | Item title |
| description | string | HTML description (if striphtml=0) |
| file_size | number | Bytes |
| file_url | string | Direct download URL |
| preview_url | string | Thumbnail image URL |
| filename | string | Original filename |
| time_created | number | Unix timestamp |
| time_updated | number | Unix timestamp |
| visibility | number | 0=public, 1=friends, 2=private |
| flags | number | Bitfield of item flags |
| tags | array | Category tags (max 50) |
| language | string | ISO language code |
| vote_data.votes_up | number | Positive votes |
| vote_data.votes_down | number | Negative votes |
| vote_data.score | number | 0-1 rating |

---

## Rate Limiting

### Limits

The Steam API enforces soft rate limits:

| Limit | Value | Notes |
|-------|-------|-------|
| Per-IP daily | ~20,000 requests | Estimated, not documented |
| Per-minute (search) | ~1-2 requests | Very restrictive |
| Burst limit | ~100 requests | Within second |
| File downloads | No limit | Limited by bandwidth |

### Implementation

Y-Core uses exponential backoff with rate limiting:

```typescript
class RateLimiter {
  private delayMs: number = 100  // 100ms between requests

  async wait() {
    // Ensures minimum delay between consecutive requests
  }
}

// Retry strategy
const MAX_RETRIES = 3
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    return await api.fetch()
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      const backoff = 1000 * Math.pow(2, attempt)  // 1s, 2s, 4s
      await sleep(backoff)
    }
  }
}
```

### Best Practices

1. **Cache responses** - Avoid repeated identical requests
   - Mod details: 24-hour cache TTL
   - Search results: 1-hour cache TTL
   - Verify cache hit rate with `getCacheStats()`

2. **Batch queries** - Request multiple mods in single call
   ```typescript
   const fileIds = ['123', '456', '789']
   const mods = await service.getModDetailsBatch(fileIds)
   ```

3. **Implement backoff** - Handle rate limit errors gracefully
   ```typescript
   // Automatic retry with exponential backoff
   // Built into SteamWorkshopService
   ```

4. **Monitor usage** - Track API calls to avoid limits
   ```typescript
   const stats = await ipcRenderer.invoke('mods:get-cache-stats')
   console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(2)}%`)
   ```

---

## Download URLs

### URL Format
```
https://steamusercontent.com/ugc/[fileId]/[filename]
```

### Characteristics

- **Direct download** - No Steam client required
- **Bandwidth limit** - ~5 MB/s typical, varies by region
- **Resume support** - HTTP range headers supported
- **Temporary validity** - URLs valid for ~24 hours
- **Hotlinking safe** - No referrer checks

### Chunked Download

Y-Core downloads in 64 KB chunks for stability:

```typescript
const CHUNK_SIZE = 64 * 1024  // 64 KB

stream.on('data', (chunk: Buffer) => {
  totalBytes += chunk.length
  
  // Report progress every 500ms
  if (now - lastUpdate > 500) {
    onProgress({
      loaded: totalBytes,
      total: contentLength,
      speed: totalBytes / (now - startTime)
    })
  }
})
```

### Resume Capability

Downloads support HTTP 206 Partial Content:

```typescript
headers: {
  'Range': 'bytes=1024000-2048000'
}
```

Implementation handles interrupted downloads gracefully.

---

## Visibility & Access

### Visibility Levels

| Value | Meaning | Access |
|-------|---------|--------|
| 0 | Public | Anyone can find and download |
| 1 | Friends only | Only creator's friends |
| 2 | Private | Only creator (no search) |

### Access Restrictions

- **Age-gated content** - Some games require creator login
- **Region restrictions** - Some mods limited by region
- **Removed items** - Deleted mods return `result != 1`
- **Hidden items** - Report/flagged mods may be hidden

---

## Workshop Item Flags

Bitfield flags indicating item properties:

```
Bit 0: Community visible
Bit 1: Published (live)
Bit 2: Deleted
Bit 3: Banned
Bit 4: Preview removed
Bit 5: Collection (not mod)
Bit 6: Metadata changed
Bit 7: Subscriptions locked
...
```

Check flag: `(flags & (1 << bit_number)) != 0`

---

## Game-Specific Considerations

### Supported Games with Workshop

Only specific games support Workshop API. Y-Core targets games with large mod communities:

| AppID | Game | Status |
|-------|------|--------|
| 570 | Dota 2 | Fully supported |
| 440 | Team Fortress 2 | Fully supported |
| 630 | Alien Swarm | Fully supported |
| 1091500 | Cyberpunk 2077 | Workshop added 2023 |
| 12210 | Elden Ring | Not supported |

### Game-Specific Metadata

Some games include extra metadata:

```typescript
// Example: Dota 2 mod types
tags: [
  { tag: "Gameplay" },
  { tag: "Balance" },
  { tag: "Cosmetic" }
]
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Process response |
| 429 | Rate limited | Retry with backoff |
| 500 | Server error | Retry with backoff |
| 503 | Service unavailable | Retry with longer backoff |
| 404 | Not found | Item deleted/private |

### Response Error Codes

```json
{
  "response": {
    "result": 1,
    "message": "OK"
  }
}
```

| Result | Status | Description |
|--------|--------|-------------|
| 1 | Success | Data returned |
| 2 | Failure | Generic error |
| 3 | No match | Item not found |
| 4 | Pending | Item not published |
| 5 | Expired | Request outdated |
| 6 | Access denied | Permission denied |

### Timeout Handling

Y-Core uses adaptive timeouts:

```typescript
const API_TIMEOUT = 30000  // 30 seconds
const DOWNLOAD_TIMEOUT = 300000  // 5 minutes

axios.get(url, {
  timeout: operation === 'download' ? DOWNLOAD_TIMEOUT : API_TIMEOUT
})
```

### Retry Logic

```typescript
async function fetchWithRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await rateLimiter.wait()
      return await fn()
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      
      const backoff = 1000 * Math.pow(2, attempt)
      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${backoff}ms`)
      await sleep(backoff)
    }
  }
}
```

---

## Caching Strategy

### Cache Structure

```typescript
class LRUCache<K, V> {
  max: 1000                    // Max items
  maxSize: 100 * 1024 * 1024   // 100 MB
  ttl: 24 * 60 * 60 * 1000     // 24 hours
}
```

### Cache Invalidation

**Automatic:**
- TTL expiration (24 hours)
- LRU eviction (size limit)
- Manual clear

**Manual:**
```typescript
await ipcRenderer.invoke('mods:clear-cache')
```

### Cache Hit Rate

Track effectiveness:

```typescript
const stats = await ipcRenderer.invoke('mods:get-cache-stats')
const hitRate = (stats.hitRate * 100).toFixed(2)
console.log(`Cache hit rate: ${hitRate}%`)

// Expected: 70-90% hit rate in normal usage
```

---

## Search Limitations

### No Search API

Steam does NOT provide a search API. Y-Core implements search by:

1. **Fetch all mods** for a game (limited)
2. **Client-side filtering** by:
   - Title (contains search text)
   - Description (contains search text)
   - Tags (exact match)
   - Author (contains)
   - Score (minimum rating)

3. **Sort** by:
   - Trending (time_updated desc)
   - Newest (time_created desc)
   - Most subscribed (votes_up desc)
   - Top rated (score desc)
   - Alphabetical (title asc/desc)

### Limitations

- Can't search across all games at once
- Can't filter by download count
- Limited to ~1000 most popular per game
- Search is approximate (client-side)

---

## Best Practices

### 1. Cache Aggressively
```typescript
// Good: Use cache for frequently accessed data
const mods = await service.getModDetailsBatch(fileIds)

// Bad: Repeated identical requests
for (const id of fileIds) {
  const mod = await service.getModDetails(id)  // Cache miss
}
```

### 2. Batch Operations
```typescript
// Good: Single batch request
const mods = await service.getModDetailsBatch([id1, id2, id3])

// Bad: Separate requests
await Promise.all([
  service.getModDetails(id1),
  service.getModDetails(id2),
  service.getModDetails(id3)
])
```

### 3. Implement Timeouts
```typescript
// Good: Timeout prevents hanging
const result = await Promise.race([
  fetchMod(),
  sleep(30000).then(() => { throw new Error('Timeout') })
])

// Bad: No timeout
const result = await fetchMod()
```

### 4. Handle Errors Gracefully
```typescript
// Good: Retry with backoff
try {
  return await fetchWithRetry(() => api.get(url))
} catch (err) {
  logger.error(`Failed after retries: ${err.message}`)
  return cachedData || defaultValue
}

// Bad: Immediate failure
return await api.get(url)
```

### 5. Monitor Rate Limits
```typescript
// Good: Track cache stats
const stats = await ipcRenderer.invoke('mods:get-cache-stats')
if (stats.hitRate < 0.5) {
  logger.warn('Low cache hit rate - check for excessive API calls')
}

// Bad: No monitoring
// (Could hit rate limits unknowingly)
```

---

## Troubleshooting

### "API Timeout"
**Cause:** Network latency or Steam API slow  
**Solution:**
1. Increase timeout: `API_TIMEOUT = 45000`
2. Retry request manually
3. Check network connectivity
4. Try again later

### "Rate Limited (429)"
**Cause:** Too many requests  
**Solution:**
1. Wait 1+ hours before retrying
2. Implement aggressive caching
3. Batch requests more efficiently
4. Distribute requests over time

### "Mod Not Found"
**Cause:** Deleted, private, or removed  
**Solution:**
1. Verify fileId is correct
2. Check if mod is still published
3. Check if creator removed it
4. Look for replacement mod

### "Download Interrupted"
**Cause:** Network connection lost  
**Solution:**
1. Resume is automatic (HTTP 206)
2. Check disk space
3. Retry installation
4. Check Steam CDN status

### "Cache Not Working"
**Cause:** Cache not returning results  
**Solution:**
```typescript
// Clear and rebuild cache
await ipcRenderer.invoke('mods:clear-cache')

// Check cache stats
const stats = await ipcRenderer.invoke('mods:get-cache-stats')
console.log(stats)
```

---

## Performance Metrics

### Typical Latencies

| Operation | Latency | Notes |
|-----------|---------|-------|
| Cached mod details | 1-5 ms | In-memory LRU |
| API mod details | 200-500 ms | Network + Steam API |
| Download 10 MB | 2-5 seconds | Typical, varies by region |
| Search (100 results) | 1-2 seconds | Client-side filtering |
| Database query | 5-50 ms | SQLite, indexed |

### Throughput

- **Sequential downloads:** ~1-2 MB/s typical
- **API requests/minute:** ~5-10 sustainable
- **Parallel database queries:** 10+ concurrent

---

## Future Improvements

1. **Steamworks SDK** - Direct C++ bindings for faster access
2. **Pagination API** - If Steam adds search API
3. **Webhook updates** - Real-time mod update notifications
4. **Mirror support** - Fallback CDNs if Steam unavailable
5. **Compression** - Gzip metadata in cache
6. **Analytics** - Track popular mods, trends

---

## References

- [Steamworks API Documentation](https://partner.steamgames.com/doc/api)
- [Workshop Publishing Documentation](https://partner.steamgames.com/doc/features/workshop/publish)
- [ISteamRemoteStorage Interface](https://partner.steamgames.com/doc/webapi/ISteamRemoteStorage)
- [Steam Authentication](https://partner.steamgames.com/doc/webapi/ISteamUserOAuth)

---

## Support

For issues:
1. Check Steam API status at https://steamstat.us/
2. Verify Workshop is enabled for target game
3. Check if mod is still published on Steam
4. Review Y-Core logs in `userData/logs/`

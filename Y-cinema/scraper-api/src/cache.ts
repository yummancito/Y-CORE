import { LRUCache } from 'lru-cache'

const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hora
const MAX_ENTRIES = 500

export class ScraperCache {
  private cache: LRUCache<string, any>

  constructor() {
    this.cache = new LRUCache({
      max: MAX_ENTRIES,
      ttl: DEFAULT_TTL_MS,
    })
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, value, { ttl: ttlMs || DEFAULT_TTL_MS })
  }

  /** Cachea el resultado de una función async */
  async wrap<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = this.get<T>(key)
    if (hit !== undefined) return hit

    const value = await fetcher()
    const isEmpty = value == null || (Array.isArray(value) && value.length === 0)

    if (!isEmpty) {
      this.set(key, value, ttlMs)
    }

    return value
  }

  /** Invalida una entrada específica o todas las de un prefijo */
  invalidate(keyPrefix: string): void {
    if (this.cache.has(keyPrefix)) {
      this.cache.delete(keyPrefix)
    } else {
      // Borrar todas las keys que empiecen con el prefijo
      for (const key of this.cache.keys()) {
        if (key.startsWith(keyPrefix)) {
          this.cache.delete(key)
        }
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  getStats(): { size: number; max: number; ttl: number } {
    return {
      size: this.cache.size,
      max: MAX_ENTRIES,
      ttl: DEFAULT_TTL_MS,
    }
  }
}

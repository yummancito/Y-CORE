// cache-store.ts — Caché en memoria con TTL por categoría (Fase 9)
// Envuelve llamadas caras (búsquedas, detalles, tendencias) para no repetirlas.
// TTLs recomendados por el plan: búsquedas 1h, detalles 24h, tendencias 6h.

export type CacheCategory = 'search' | 'details' | 'trending' | 'recommendations' | 'episodes'

const TTL_MS: Record<CacheCategory, number> = {
  search: 60 * 60 * 1000, // 1 hora
  details: 24 * 60 * 60 * 1000, // 24 horas
  trending: 6 * 60 * 60 * 1000, // 6 horas
  recommendations: 6 * 60 * 60 * 1000,
  episodes: 24 * 60 * 60 * 1000,
}

interface Entry<T> {
  value: T
  expires: number
}

const MAX_ENTRIES = 500

export class CacheStore {
  private store = new Map<string, Entry<unknown>>()

  private key(category: CacheCategory, id: string): string {
    return `${category}:${id}`
  }

  get<T>(category: CacheCategory, id: string): T | undefined {
    const entry = this.store.get(this.key(category, id))
    if (!entry) return undefined
    if (Date.now() > entry.expires) {
      this.store.delete(this.key(category, id))
      return undefined
    }
    return entry.value as T
  }

  set<T>(category: CacheCategory, id: string, value: T): void {
    // Poda simple: si se llena, borrar el más viejo por expiración
    if (this.store.size >= MAX_ENTRIES) {
      let oldestKey: string | null = null
      let oldest = Infinity
      for (const [k, v] of this.store) {
        if (v.expires < oldest) {
          oldest = v.expires
          oldestKey = k
        }
      }
      if (oldestKey) this.store.delete(oldestKey)
    }
    this.store.set(this.key(category, id), {
      value,
      expires: Date.now() + TTL_MS[category],
    })
  }

  /**
   * Envuelve una función async: devuelve el valor cacheado si existe y está
   * fresco, si no ejecuta `fetcher`, cachea y devuelve. No cachea si el
   * resultado es null/undefined/array vacío (para no fijar fallos transitorios).
   */
  async wrap<T>(category: CacheCategory, id: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(category, id)
    if (hit !== undefined) return hit
    const value = await fetcher()
    const isEmpty =
      value == null || (Array.isArray(value) && value.length === 0)
    if (!isEmpty) this.set(category, id, value)
    return value
  }

  invalidate(category: CacheCategory, id?: string): void {
    if (id) {
      this.store.delete(this.key(category, id))
    } else {
      for (const k of this.store.keys()) {
        if (k.startsWith(`${category}:`)) this.store.delete(k)
      }
    }
  }

  clear(): void {
    this.store.clear()
  }
}

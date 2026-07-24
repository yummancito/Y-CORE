import { describe, expect, it } from 'vitest'
import { TmdbProvider } from '../../src/providers/tmdb/tmdb.provider.js'

// Test de humo contra la API REAL de TMDB (no mockeada) — a diferencia de
// tmdb.provider.test.ts (MSW), esto verifica que la API key configurada en
// .env realmente funciona contra el servicio en producción. Se saltra sola
// si no hay key disponible en el proceso (p.ej. en CI sin secrets).
describe('TmdbProvider (llamada real, sin mocks)', () => {
  const apiKey = process.env.TMDB_API_KEY

  it('search() contra la API real de TMDB devuelve resultados', async () => {
    if (!apiKey) {
      console.warn('[SKIP] TMDB_API_KEY no está en el entorno — ver .env.example.')
      return
    }

    const provider = new TmdbProvider({ apiKey, mediaType: 'movie' })
    const page = await provider.search({ query: 'The Matrix' })

    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items[0]?.title).toBeTruthy()
  })
})

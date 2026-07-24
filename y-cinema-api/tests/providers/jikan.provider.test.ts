import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { JikanProvider } from '../../src/providers/jikan/jikan.provider.js'
import type { JikanAnimeEntry } from '../../src/providers/jikan/jikan.types.js'

const JIKAN_BASE = 'https://api.jikan.moe/v4'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeEntry(overrides: Partial<JikanAnimeEntry> = {}): JikanAnimeEntry {
  return {
    mal_id: 1,
    title: 'Cowboy Bebop',
    title_english: 'Cowboy Bebop',
    title_japanese: null,
    synopsis: null,
    images: { jpg: { image_url: null, large_image_url: null } },
    score: 8.75,
    scored_by: 1000,
    rank: 1,
    popularity: 1,
    genres: [{ name: 'Action' }],
    studios: [{ name: 'Sunrise' }],
    type: 'TV',
    episodes: 26,
    status: 'Finished Airing',
    aired: { from: '1998-04-03', to: '1999-04-24' },
    duration: '24 min',
    rating: 'R',
    source: 'Original',
    season: 'spring',
    year: 1998,
    url: 'https://myanimelist.net/anime/1',
    trailer: null,
    ...overrides,
  }
}

describe('JikanProvider', () => {
  it('isEnabled() siempre es true (no requiere API key)', () => {
    expect(new JikanProvider().isEnabled()).toBe(true)
  })

  it('search() mapea data[] + pagination a ProviderPage', async () => {
    server.use(
      http.get(`${JIKAN_BASE}/anime`, () =>
        HttpResponse.json({
          data: [makeEntry()],
          pagination: { current_page: 1, has_next_page: false, items: { count: 1, total: 1, per_page: 25 } },
        }),
      ),
    )

    const provider = new JikanProvider()
    const page = await provider.search({ query: 'cowboy bebop' })

    expect(page.items).toHaveLength(1)
    expect(page.totalResults).toBe(1)
  })

  it('reintenta una vez ante un 429', async () => {
    let callCount = 0
    server.use(
      http.get(`${JIKAN_BASE}/anime/1`, () => {
        callCount += 1
        if (callCount === 1) return new HttpResponse(null, { status: 429 })
        return HttpResponse.json({ data: makeEntry() })
      }),
    )

    const provider = new JikanProvider()
    const result = await provider.details('1')

    expect(callCount).toBe(2)
    expect(result?.title).toBe('Cowboy Bebop')
  })

  it('details() devuelve null en 404', async () => {
    server.use(http.get(`${JIKAN_BASE}/anime/99999`, () => new HttpResponse(null, { status: 404 })))
    const provider = new JikanProvider()
    expect(await provider.details('99999')).toBeNull()
  })

  it('episodes() siempre devuelve [] — Jikan no expone episodios estructurados', async () => {
    const provider = new JikanProvider()
    expect(await provider.episodes()).toEqual([])
  })
})

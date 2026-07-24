import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { TmdbProvider } from '../../src/providers/tmdb/tmdb.provider.js'
import { ProviderError } from '../../src/providers/types.js'
import type { TmdbListResponse } from '../../src/providers/tmdb/tmdb.types.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeListResponse(overrides: Partial<TmdbListResponse> = {}): TmdbListResponse {
  return {
    page: 1,
    results: [],
    total_pages: 1,
    total_results: 0,
    ...overrides,
  }
}

describe('TmdbProvider', () => {
  it('isEnabled() es false sin API key', () => {
    const provider = new TmdbProvider({ apiKey: undefined })
    expect(provider.isEnabled()).toBe(false)
  })

  it('isEnabled() es true con API key', () => {
    const provider = new TmdbProvider({ apiKey: 'fake-key' })
    expect(provider.isEnabled()).toBe(true)
  })

  it('search() lanza ProviderError sin API key', async () => {
    const provider = new TmdbProvider({ apiKey: undefined })
    await expect(provider.search({ query: 'matrix' })).rejects.toThrow(ProviderError)
  })

  it('search() devuelve items mapeados a ProviderPage', async () => {
    server.use(
      http.get(`${TMDB_BASE}/search/movie`, () =>
        HttpResponse.json(
          makeListResponse({
            results: [
              {
                id: 603,
                title: 'The Matrix',
                overview: '...',
                poster_path: '/poster.jpg',
                backdrop_path: null,
                vote_average: 8.7,
                vote_count: 100,
                genre_ids: [28],
                popularity: 90,
                original_language: 'en',
              },
            ],
            total_results: 1,
          }),
        ),
      ),
    )

    const provider = new TmdbProvider({ apiKey: 'fake-key' })
    const page = await provider.search({ query: 'matrix' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.title).toBe('The Matrix')
    expect(page.totalResults).toBe(1)
  })

  it('reintenta una vez ante un 429 y devuelve el resultado del reintento', async () => {
    let callCount = 0
    server.use(
      http.get(`${TMDB_BASE}/search/movie`, () => {
        callCount += 1
        if (callCount === 1) {
          return new HttpResponse(null, { status: 429 })
        }
        return HttpResponse.json(makeListResponse({ total_results: 0 }))
      }),
    )

    const provider = new TmdbProvider({ apiKey: 'fake-key' })
    const page = await provider.search({ query: 'anything' })

    expect(callCount).toBe(2)
    expect(page.items).toEqual([])
  })

  it('lanza ProviderError con mensaje claro en un 401', async () => {
    server.use(
      http.get(`${TMDB_BASE}/search/movie`, () => new HttpResponse(null, { status: 401 })),
    )

    const provider = new TmdbProvider({ apiKey: 'bad-key' })
    await expect(provider.search({ query: 'x' })).rejects.toThrow(/rechazada/)
  })

  it('details() devuelve null en un 404', async () => {
    server.use(http.get(`${TMDB_BASE}/movie/999999`, () => new HttpResponse(null, { status: 404 })))

    const provider = new TmdbProvider({ apiKey: 'fake-key' })
    const result = await provider.details('999999')

    expect(result).toBeNull()
  })
})

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { TvMazeProvider } from '../../src/providers/tvmaze/tvmaze.provider.js'
import { ProviderError } from '../../src/providers/types.js'
import type { TvMazeShow } from '../../src/providers/tvmaze/tvmaze.types.js'

const TVMAZE_BASE = 'https://api.tvmaze.com'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeShow(overrides: Partial<TvMazeShow> = {}): TvMazeShow {
  return {
    id: 1,
    name: 'Breaking Bad',
    summary: '<p>Un profesor...</p>',
    image: { medium: null, original: 'https://x/img.jpg' },
    rating: { average: 9.3 },
    premiered: '2008-01-20',
    genres: ['Drama'],
    language: 'English',
    url: 'https://tvmaze.com/shows/1',
    externals: { imdb: 'tt0903747', thetvdb: 81189 },
    ...overrides,
  }
}

describe('TvMazeProvider', () => {
  it('isEnabled() siempre es true (no requiere API key)', () => {
    expect(new TvMazeProvider().isEnabled()).toBe(true)
  })

  it('search() mapea el shape {score, show}[] a items', async () => {
    server.use(
      http.get(`${TVMAZE_BASE}/search/shows`, () =>
        HttpResponse.json([{ score: 10, show: makeShow() }]),
      ),
    )

    const provider = new TvMazeProvider()
    const page = await provider.search({ query: 'breaking bad' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.name).toBe('Breaking Bad')
  })

  it('details() devuelve null en 404', async () => {
    server.use(http.get(`${TVMAZE_BASE}/shows/999`, () => new HttpResponse(null, { status: 404 })))

    const provider = new TvMazeProvider()
    expect(await provider.details('999')).toBeNull()
  })

  it('episodes() filtra solo la temporada pedida', async () => {
    server.use(
      http.get(`${TVMAZE_BASE}/shows/1/episodes`, () =>
        HttpResponse.json([
          { id: 1, name: 'Pilot', season: 1, number: 1, airdate: '2008-01-20', runtime: 60, summary: null, image: null },
          { id: 2, name: 'Cat in the Bag', season: 1, number: 2, airdate: '2008-01-27', runtime: 60, summary: null, image: null },
          { id: 3, name: 'Seven Thirty-Seven', season: 2, number: 1, airdate: '2009-03-08', runtime: 60, summary: null, image: null },
        ]),
      ),
    )

    const provider = new TvMazeProvider()
    const episodes = await provider.episodes('1', 1)

    expect(episodes).toHaveLength(2)
    expect(episodes.every((e) => e.season === 1)).toBe(true)
  })

  it('trending()/discover()/popular()/recommendations() fallan explícito (no soportados por TVMaze)', async () => {
    const provider = new TvMazeProvider()
    await expect(provider.trending()).rejects.toThrow(ProviderError)
    await expect(provider.discover({})).rejects.toThrow(ProviderError)
    await expect(provider.popular()).rejects.toThrow(ProviderError)
    await expect(provider.recommendations()).rejects.toThrow(ProviderError)
  })
})

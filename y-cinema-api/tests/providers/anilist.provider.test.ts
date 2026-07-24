import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { AniListProvider } from '../../src/providers/anilist/anilist.provider.js'
import { ProviderError } from '../../src/providers/types.js'
import type { AniListMedia } from '../../src/providers/anilist/anilist.types.js'

const ANILIST_URL = 'https://graphql.anilist.co'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeMedia(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 1,
    title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' },
    description: '<p>Humanidad vs titanes</p>',
    coverImage: { extraLarge: 'https://x/cover.jpg', large: null },
    bannerImage: null,
    averageScore: 85,
    startDate: { year: 2013, month: 4, day: 7 },
    genres: ['Action', 'Drama'],
    episodes: 25,
    format: 'TV',
    siteUrl: 'https://anilist.co/anime/1',
    ...overrides,
  }
}

describe('AniListProvider', () => {
  it('isEnabled() siempre es true (no requiere API key)', () => {
    expect(new AniListProvider().isEnabled()).toBe(true)
  })

  it('search() envía una query GraphQL POST y mapea Page.media', async () => {
    server.use(
      http.post(ANILIST_URL, () => HttpResponse.json({ data: { Page: { media: [makeMedia()] } } })),
    )

    const provider = new AniListProvider()
    const page = await provider.search({ query: 'attack on titan' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.title.english).toBe('Attack on Titan')
  })

  it('lanza ProviderError cuando la respuesta trae errors[]', async () => {
    server.use(
      http.post(ANILIST_URL, () =>
        HttpResponse.json({ data: null, errors: [{ message: 'Invalid request' }] }),
      ),
    )

    const provider = new AniListProvider()
    await expect(provider.search({ query: 'x' })).rejects.toThrow(ProviderError)
  })

  it('details() devuelve null cuando Media es null', async () => {
    server.use(http.post(ANILIST_URL, () => HttpResponse.json({ data: { Media: null } })))

    const provider = new AniListProvider()
    expect(await provider.details('999999')).toBeNull()
  })

  it('images() y recommendations() fallan explícito (no soportados en Fase 4)', async () => {
    const provider = new AniListProvider()
    await expect(provider.images()).rejects.toThrow(ProviderError)
    await expect(provider.recommendations()).rejects.toThrow(ProviderError)
  })
})

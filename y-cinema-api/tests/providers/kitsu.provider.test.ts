import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { KitsuProvider } from '../../src/providers/kitsu/kitsu.provider.js'
import { ProviderError } from '../../src/providers/types.js'
import type { KitsuResource } from '../../src/providers/kitsu/kitsu.types.js'

const KITSU_BASE = 'https://kitsu.io/api/edge'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeResource(overrides: Partial<KitsuResource['attributes']> = {}): KitsuResource {
  return {
    id: '1',
    type: 'anime',
    attributes: {
      canonicalTitle: 'One Piece',
      titles: { en: 'One Piece', en_jp: null, ja_jp: null },
      synopsis: null,
      posterImage: null,
      coverImage: null,
      averageRating: '85.5',
      startDate: '1999-10-20',
      episodeCount: null,
      subtype: 'TV',
      status: 'current',
      ...overrides,
    },
  }
}

describe('KitsuProvider', () => {
  it('isEnabled() siempre es true (no requiere API key)', () => {
    expect(new KitsuProvider().isEnabled()).toBe(true)
  })

  it('search() convierte page a offset y mapea meta.count a totalResults/totalPages', async () => {
    server.use(
      http.get(`${KITSU_BASE}/anime`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('filter[text]')).toBe('one piece')
        expect(url.searchParams.get('page[offset]')).toBe('20') // page=2 → offset 20
        return HttpResponse.json({ data: [makeResource()], meta: { count: 45 } })
      }),
    )

    const provider = new KitsuProvider()
    const page = await provider.search({ query: 'one piece', page: 2 })

    expect(page.items).toHaveLength(1)
    expect(page.totalResults).toBe(45)
    expect(page.totalPages).toBe(3) // ceil(45/20)
  })

  it('details() devuelve null en 404', async () => {
    server.use(http.get(`${KITSU_BASE}/anime/999999`, () => new HttpResponse(null, { status: 404 })))
    const provider = new KitsuProvider()
    expect(await provider.details('999999')).toBeNull()
  })

  it('images() y recommendations() fallan explícito (no soportados en Fase 4)', async () => {
    const provider = new KitsuProvider()
    await expect(provider.images()).rejects.toThrow(ProviderError)
    await expect(provider.recommendations()).rejects.toThrow(ProviderError)
  })

  it('episodes() devuelve [] (fuera de alcance de Fase 4)', async () => {
    const provider = new KitsuProvider()
    expect(await provider.episodes()).toEqual([])
  })
})

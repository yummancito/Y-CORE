import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { FanArtProvider } from '../../src/providers/fanart/fanart.provider.js'
import { ProviderError } from '../../src/providers/types.js'

const FANART_BASE = 'https://webservice.fanart.tv/v3'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('FanArtProvider', () => {
  it('isEnabled() es false sin API key', () => {
    expect(new FanArtProvider({ apiKey: undefined }).isEnabled()).toBe(false)
  })

  it('images() lanza ProviderError sin API key', async () => {
    const provider = new FanArtProvider({ apiKey: undefined })
    await expect(provider.images('603')).rejects.toThrow(ProviderError)
  })

  it('images() consulta /movies/:id cuando mediaType=movie', async () => {
    server.use(
      http.get(`${FANART_BASE}/movies/603`, () =>
        HttpResponse.json({ tmdb_id: '603', hdmovielogo: [{ id: '1', url: 'https://x/logo.png', lang: 'en', likes: '5' }] }),
      ),
    )

    const provider = new FanArtProvider({ apiKey: 'fake-key', mediaType: 'movie' })
    const result = await provider.images('603')

    expect(result.hdmovielogo).toHaveLength(1)
  })

  it('images() consulta /tv/:id cuando mediaType=tv', async () => {
    server.use(
      http.get(`${FANART_BASE}/tv/1396`, () => HttpResponse.json({ tmdb_id: '1396', hdtvlogo: [] })),
    )

    const provider = new FanArtProvider({ apiKey: 'fake-key', mediaType: 'tv' })
    const result = await provider.images('1396')

    expect(result.tmdb_id).toBe('1396')
  })

  it('search()/details()/trending()/discover()/popular()/recommendations() fallan explícito', async () => {
    const provider = new FanArtProvider({ apiKey: 'fake-key' })
    await expect(provider.search({ query: 'x' })).rejects.toThrow(ProviderError)
    await expect(provider.details()).rejects.toThrow(ProviderError)
    await expect(provider.trending()).rejects.toThrow(ProviderError)
    await expect(provider.discover({})).rejects.toThrow(ProviderError)
    await expect(provider.popular()).rejects.toThrow(ProviderError)
    await expect(provider.recommendations()).rejects.toThrow(ProviderError)
  })
})

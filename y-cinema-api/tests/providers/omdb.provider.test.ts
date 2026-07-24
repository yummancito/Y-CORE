import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { OmdbProvider } from '../../src/providers/omdb/omdb.provider.js'
import { ProviderError } from '../../src/providers/types.js'

const OMDB_BASE = 'https://www.omdbapi.com'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('OmdbProvider', () => {
  it('isEnabled() es false sin API key', () => {
    expect(new OmdbProvider({ apiKey: undefined }).isEnabled()).toBe(false)
  })

  it('details() lanza ProviderError sin API key', async () => {
    const provider = new OmdbProvider({ apiKey: undefined })
    await expect(provider.details('tt0133093')).rejects.toThrow(ProviderError)
  })

  it('details() devuelve el resultado consolidado en éxito', async () => {
    server.use(
      http.get(OMDB_BASE, () =>
        HttpResponse.json({
          Response: 'True',
          imdbID: 'tt0133093',
          Title: 'The Matrix',
          Ratings: [{ Source: 'Internet Movie Database', Value: '8.7/10' }],
        }),
      ),
    )

    const provider = new OmdbProvider({ apiKey: 'fake-key' })
    const result = await provider.details('tt0133093')

    expect(result?.Title).toBe('The Matrix')
    expect(result?.Ratings).toHaveLength(1)
  })

  it('details() devuelve null cuando Response=False', async () => {
    server.use(
      http.get(OMDB_BASE, () => HttpResponse.json({ Response: 'False', Error: 'Movie not found!' })),
    )

    const provider = new OmdbProvider({ apiKey: 'fake-key' })
    expect(await provider.details('tt9999999')).toBeNull()
  })

  it('search()/images()/trending()/discover()/popular()/recommendations() fallan explícito', async () => {
    const provider = new OmdbProvider({ apiKey: 'fake-key' })
    await expect(provider.search({ query: 'x' })).rejects.toThrow(ProviderError)
    await expect(provider.images()).rejects.toThrow(ProviderError)
    await expect(provider.trending()).rejects.toThrow(ProviderError)
    await expect(provider.discover({})).rejects.toThrow(ProviderError)
    await expect(provider.popular()).rejects.toThrow(ProviderError)
    await expect(provider.recommendations()).rejects.toThrow(ProviderError)
  })
})

import { describe, expect, it } from 'vitest'
import { resolveImdbId } from '../../src/modules/media/media.repository.js'

type ProviderRef = Parameters<typeof resolveImdbId>[0][number]

function makeRef(overrides: Partial<ProviderRef>): ProviderRef {
  return {
    externalId: 'unused',
    raw: null,
    provider: { slug: 'tmdb' },
    ...overrides,
  }
}

describe('resolveImdbId', () => {
  it('devuelve el imdb_id desde raw.external_ids de una ref tmdb', () => {
    const refs = [
      makeRef({
        provider: { slug: 'tmdb' },
        raw: { external_ids: { imdb_id: 'tt0133093' } },
      }),
    ]
    expect(resolveImdbId(refs)).toBe('tt0133093')
  })

  it('cae a la ref omdb cuando tmdb no tiene imdb_id', () => {
    const refs = [
      makeRef({ provider: { slug: 'tmdb' }, raw: { external_ids: { imdb_id: null } } }),
      makeRef({ provider: { slug: 'omdb' }, externalId: 'tt0133093' }),
    ]
    expect(resolveImdbId(refs)).toBe('tt0133093')
  })

  it('usa el externalId de omdb directo cuando no hay ninguna ref tmdb', () => {
    const refs = [makeRef({ provider: { slug: 'omdb' }, externalId: 'tt0133093' })]
    expect(resolveImdbId(refs)).toBe('tt0133093')
  })

  it('devuelve null cuando no hay providerRefs en absoluto', () => {
    expect(resolveImdbId([])).toBeNull()
  })

  it('devuelve null cuando ni tmdb ni omdb están presentes', () => {
    const refs = [makeRef({ provider: { slug: 'fanart' } })]
    expect(resolveImdbId(refs)).toBeNull()
  })

  it('no explota si raw de tmdb es null, y cae a null sin ref omdb', () => {
    const refs = [makeRef({ provider: { slug: 'tmdb' }, raw: null })]
    expect(resolveImdbId(refs)).toBeNull()
  })

  it('no explota si raw de tmdb no tiene external_ids', () => {
    const refs = [makeRef({ provider: { slug: 'tmdb' }, raw: { title: 'The Matrix' } })]
    expect(resolveImdbId(refs)).toBeNull()
  })

  it('no explota si external_ids.imdb_id no es un string', () => {
    const refs = [
      makeRef({ provider: { slug: 'tmdb' }, raw: { external_ids: { imdb_id: 12345 } } }),
    ]
    expect(resolveImdbId(refs)).toBeNull()
  })

  it('ignora un imdb_id vacío en tmdb y cae a omdb', () => {
    const refs = [
      makeRef({ provider: { slug: 'tmdb' }, raw: { external_ids: { imdb_id: '' } } }),
      makeRef({ provider: { slug: 'omdb' }, externalId: 'tt9999999' }),
    ]
    expect(resolveImdbId(refs)).toBe('tt9999999')
  })
})

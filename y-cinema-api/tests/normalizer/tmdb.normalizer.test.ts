import { describe, expect, it } from 'vitest'
import { normalizeTmdbMedia } from '../../src/services/normalizer/tmdb.normalizer.js'
import type { TmdbDetails } from '../../src/providers/tmdb/tmdb.types.js'

function makeDetails(overrides: Partial<TmdbDetails> = {}): TmdbDetails {
  return {
    id: 603,
    title: 'The Matrix',
    tagline: 'Welcome to the Real World',
    overview: 'A hacker discovers reality is a simulation.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '1999-03-31',
    vote_average: 8.7,
    vote_count: 25000,
    runtime: 136,
    genres: [{ id: 28, name: 'Acción' }, { id: 878, name: 'Ciencia Ficción' }],
    status: 'Released',
    original_language: 'en',
    popularity: 90.5,
    ...overrides,
  }
}

describe('normalizeTmdbMedia', () => {
  it('mapea los campos escalares básicos', () => {
    const result = normalizeTmdbMedia(makeDetails(), null, 'movie')

    expect(result.type).toBe('MOVIE')
    expect(result.title).toBe('The Matrix')
    expect(result.releaseDate).toBe('1999-03-31')
    expect(result.runtimeMinutes).toBe(136)
    expect(result.status).toBe('RELEASED')
  })

  it('genera slugs de género estables sin acentos', () => {
    const result = normalizeTmdbMedia(makeDetails(), null, 'movie')

    expect(result.genres).toEqual([
      { slug: 'accion', name: 'Acción' },
      { slug: 'ciencia-ficcion', name: 'Ciencia Ficción' },
    ])
  })

  it('produce el poster y backdrop como imágenes con la URL absoluta de TMDB', () => {
    const result = normalizeTmdbMedia(makeDetails(), null, 'movie')

    expect(result.images).toContainEqual(
      expect.objectContaining({ type: 'POSTER', url: 'https://image.tmdb.org/t/p/w500/poster.jpg' }),
    )
    expect(result.images).toContainEqual(
      expect.objectContaining({
        type: 'BACKDROP',
        url: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
      }),
    )
  })

  it('incluye el rating de TMDB en escala 10', () => {
    const result = normalizeTmdbMedia(makeDetails(), null, 'movie')

    expect(result.ratings).toEqual([{ source: 'tmdb', value: 8.7, scale: 10, voteCount: 25000 }])
  })

  it('mapea cast y directores desde credits, si están presentes', () => {
    const details = makeDetails({
      credits: {
        cast: [{ id: 1, name: 'Keanu Reeves', character: 'Neo', profile_path: '/keanu.jpg', order: 0 }],
        crew: [
          { id: 2, name: 'Lana Wachowski', job: 'Director', department: 'Directing', profile_path: null },
          { id: 3, name: 'Someone Else', job: 'Producer', department: 'Production', profile_path: null },
        ],
      },
    })

    const result = normalizeTmdbMedia(details, null, 'movie')

    expect(result.people).toContainEqual(
      expect.objectContaining({ name: 'Keanu Reeves', role: 'ACTOR', characterName: 'Neo' }),
    )
    expect(result.people).toContainEqual(
      expect.objectContaining({ name: 'Lana Wachowski', role: 'DIRECTOR' }),
    )
    expect(result.people.find((p) => p.name === 'Someone Else')).toBeUndefined()
  })

  it('setea type=SERIES cuando mediaType=tv', () => {
    const result = normalizeTmdbMedia(makeDetails({ name: 'Breaking Bad', title: undefined }), null, 'tv')
    expect(result.type).toBe('SERIES')
    expect(result.title).toBe('Breaking Bad')
  })

  it('guarda la referencia externa con el proveedor y raw payload', () => {
    const details = makeDetails()
    const result = normalizeTmdbMedia(details, null, 'movie')

    expect(result.externalRef).toEqual({
      providerSlug: 'tmdb',
      externalId: '603',
      raw: details,
    })
  })
})

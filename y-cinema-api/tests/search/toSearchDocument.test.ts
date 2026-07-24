import { describe, expect, it } from 'vitest'
import { toSearchDocument } from '../../src/modules/search/search.service.js'
import type { Media } from '../../src/types/media.js'

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: 'media-1',
    type: 'MOVIE',
    title: 'The Matrix',
    originalTitle: null,
    overview: 'A hacker discovers reality is a simulation.',
    tagline: null,
    status: 'RELEASED',
    releaseDate: '1999-03-31',
    runtimeMinutes: 136,
    originalLangCode: 'en',
    popularity: 90,
    imdbId: null,
    genres: [{ id: 'g1', slug: 'accion', name: 'Acción' }],
    people: [
      { id: 'p1', name: 'Keanu Reeves', profileUrl: null, role: 'ACTOR', characterName: 'Neo', billingOrder: 0 },
      { id: 'p2', name: 'Lana Wachowski', profileUrl: null, role: 'DIRECTOR', characterName: null, billingOrder: null },
    ],
    images: [{ id: 'i1', type: 'POSTER', url: 'https://x/poster.jpg', width: null, height: null, languageCode: null }],
    ratings: [],
    collections: [{ id: 'c1', name: 'The Matrix Collection', overview: null }],
    seasons: [],
    translations: [],
    ...overrides,
  }
}

describe('toSearchDocument', () => {
  it('mapea los campos escalares y deriva releaseYear de releaseDate', () => {
    const doc = toSearchDocument(makeMedia())

    expect(doc.id).toBe('media-1')
    expect(doc.title).toBe('The Matrix')
    expect(doc.releaseYear).toBe(1999)
    expect(doc.popularity).toBe(90)
  })

  it('releaseYear es null cuando no hay releaseDate', () => {
    const doc = toSearchDocument(makeMedia({ releaseDate: null }))
    expect(doc.releaseYear).toBeNull()
  })

  it('solo incluye ACTOR en actors, no DIRECTOR', () => {
    const doc = toSearchDocument(makeMedia())
    expect(doc.actors).toEqual(['Keanu Reeves'])
  })

  it('mapea géneros y colecciones a sus nombres', () => {
    const doc = toSearchDocument(makeMedia())
    expect(doc.genres).toEqual(['Acción'])
    expect(doc.collections).toEqual(['The Matrix Collection'])
  })

  it('toma la primera imagen de tipo POSTER como posterUrl', () => {
    const doc = toSearchDocument(makeMedia())
    expect(doc.posterUrl).toBe('https://x/poster.jpg')
  })

  it('posterUrl es null cuando no hay ninguna imagen POSTER', () => {
    const doc = toSearchDocument(
      makeMedia({ images: [{ id: 'i2', type: 'BACKDROP', url: 'https://x/bg.jpg', width: null, height: null, languageCode: null }] }),
    )
    expect(doc.posterUrl).toBeNull()
  })
})

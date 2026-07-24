import { describe, expect, it } from 'vitest'
import { normalizeAniListMedia } from '../../src/services/normalizer/anilist.normalizer.js'
import type { AniListMedia } from '../../src/providers/anilist/anilist.types.js'

function makeMedia(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 1,
    title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' },
    description: '<p>Humanidad vs titanes</p>',
    coverImage: { extraLarge: 'https://x/cover.jpg', large: null },
    bannerImage: 'https://x/banner.jpg',
    averageScore: 85,
    startDate: { year: 2013, month: 4, day: 7 },
    genres: ['Action', 'Drama'],
    episodes: 25,
    format: 'TV',
    siteUrl: 'https://anilist.co/anime/1',
    ...overrides,
  }
}

describe('normalizeAniListMedia', () => {
  it('prefiere el título en inglés, con fallback a romaji y luego nativo', () => {
    expect(normalizeAniListMedia(makeMedia()).title).toBe('Attack on Titan')
    expect(
      normalizeAniListMedia(makeMedia({ title: { romaji: 'Foo', english: null, native: 'バー' } }))
        .title,
    ).toBe('Foo')
    expect(
      normalizeAniListMedia(makeMedia({ title: { romaji: null, english: null, native: 'バー' } }))
        .title,
    ).toBe('バー')
  })

  it('siempre normaliza a type=ANIME', () => {
    expect(normalizeAniListMedia(makeMedia()).type).toBe('ANIME')
  })

  it('limpia el HTML de la sinopsis', () => {
    const result = normalizeAniListMedia(makeMedia())
    expect(result.overview).toBe('Humanidad vs titanes')
  })

  it('formatea startDate a ISO, rellenando mes/día faltantes', () => {
    expect(normalizeAniListMedia(makeMedia()).releaseDate).toBe('2013-04-07')
    expect(
      normalizeAniListMedia(makeMedia({ startDate: { year: 2020, month: null, day: null } }))
        .releaseDate,
    ).toBe('2020-01-01')
    expect(
      normalizeAniListMedia(makeMedia({ startDate: { year: null, month: null, day: null } }))
        .releaseDate,
    ).toBeNull()
  })

  it('convierte averageScore (0-100) a escala 0-10 para el rating', () => {
    const result = normalizeAniListMedia(makeMedia())
    expect(result.ratings).toEqual([{ source: 'anilist', value: 8.5, scale: 10, voteCount: null }])
  })

  it('no genera rating cuando averageScore es null', () => {
    const result = normalizeAniListMedia(makeMedia({ averageScore: null }))
    expect(result.ratings).toEqual([])
  })

  it('guarda la referencia externa con el proveedor anilist', () => {
    const result = normalizeAniListMedia(makeMedia())
    expect(result.externalRef.providerSlug).toBe('anilist')
    expect(result.externalRef.externalId).toBe('1')
  })
})

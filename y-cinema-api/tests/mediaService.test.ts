import { describe, expect, it, vi } from 'vitest'
import { MediaService } from '../src/modules/media/media.service.js'
import type { MediaRepository } from '../src/modules/media/media.repository.js'
import type { Media } from '../src/types/media.js'

function makeFakeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: 'fake-id',
    type: 'MOVIE',
    title: 'Fake Movie',
    originalTitle: null,
    overview: null,
    tagline: null,
    status: 'RELEASED',
    releaseDate: null,
    runtimeMinutes: null,
    originalLangCode: null,
    popularity: 0,
    imdbId: null,
    genres: [],
    people: [],
    images: [],
    ratings: [],
    collections: [],
    seasons: [],
    translations: [],
    ...overrides,
  }
}

function makeFakeRepository(overrides: Partial<MediaRepository> = {}): MediaRepository {
  return {
    findById: vi.fn(),
    findByProviderRef: vi.fn(),
    list: vi.fn(),
    ...overrides,
  } as unknown as MediaRepository
}

describe('MediaService.getById', () => {
  it('delega directo al repositorio y devuelve lo que encuentra', async () => {
    const media = makeFakeMedia()
    const repo = makeFakeRepository({ findById: vi.fn().mockResolvedValue(media) })
    const service = new MediaService(repo)

    const result = await service.getById('fake-id')

    expect(result).toEqual(media)
    expect(repo.findById).toHaveBeenCalledWith('fake-id')
  })

  it('devuelve null cuando el repositorio no encuentra nada', async () => {
    const repo = makeFakeRepository({ findById: vi.fn().mockResolvedValue(null) })
    const service = new MediaService(repo)

    const result = await service.getById('missing')

    expect(result).toBeNull()
  })
})

describe('MediaService.list', () => {
  it('aplica page=1 y pageSize=20 por defecto', async () => {
    const repo = makeFakeRepository({
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    })
    const service = new MediaService(repo)

    await service.list({})

    expect(repo.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
  })

  it('limita pageSize a 100 incluso si se pide más', async () => {
    const repo = makeFakeRepository({
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    })
    const service = new MediaService(repo)

    await service.list({ pageSize: 500 })

    expect(repo.list).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
  })

  it('calcula totalPages correctamente', async () => {
    const repo = makeFakeRepository({
      list: vi.fn().mockResolvedValue({ items: [makeFakeMedia(), makeFakeMedia()], total: 45 }),
    })
    const service = new MediaService(repo)

    const result = await service.list({ pageSize: 20 })

    expect(result.totalPages).toBe(3)
    expect(result.total).toBe(45)
  })

  it('pasa los filtros opcionales solo cuando están presentes', async () => {
    const repo = makeFakeRepository({
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    })
    const service = new MediaService(repo)

    await service.list({ type: 'ANIME', genreSlug: 'accion', year: 2024 })

    expect(repo.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      type: 'ANIME',
      genreSlug: 'accion',
      year: 2024,
    })
  })
})

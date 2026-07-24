import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import { createSyncProvidersProcessor } from '../../src/jobs/syncProviders.processor.js'
import type { SyncProvidersJobData } from '../../src/queue/queues.js'

const { tmdbPopularMock, tmdbDetailsMock, tmdbImagesMock, tmdbIsEnabledMock } = vi.hoisted(() => ({
  tmdbPopularMock: vi.fn(),
  tmdbDetailsMock: vi.fn(),
  tmdbImagesMock: vi.fn(),
  tmdbIsEnabledMock: vi.fn(() => true),
}))

const { anilistPopularMock, anilistDetailsMock } = vi.hoisted(() => ({
  anilistPopularMock: vi.fn(),
  anilistDetailsMock: vi.fn(),
}))

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }))

vi.mock('../../src/providers/tmdb/tmdb.provider.js', () => ({
  TmdbProvider: vi.fn().mockImplementation(() => ({
    isEnabled: tmdbIsEnabledMock,
    popular: tmdbPopularMock,
    details: tmdbDetailsMock,
    images: tmdbImagesMock,
  })),
}))

vi.mock('../../src/providers/anilist/anilist.provider.js', () => ({
  AniListProvider: vi.fn().mockImplementation(() => ({
    popular: anilistPopularMock,
    details: anilistDetailsMock,
  })),
}))

vi.mock('../../src/services/normalizer/tmdb.normalizer.js', () => ({
  normalizeTmdbMedia: vi.fn(() => ({ externalRef: { providerSlug: 'tmdb', externalId: '1' } })),
}))

vi.mock('../../src/services/normalizer/anilist.normalizer.js', () => ({
  normalizeAniListMedia: vi.fn(() => ({ externalRef: { providerSlug: 'anilist', externalId: '1' } })),
}))

vi.mock('../../src/services/normalizer/normalizer.service.js', () => ({
  NormalizerService: vi.fn().mockImplementation(() => ({ upsert: upsertMock })),
}))

function makeJob(data: SyncProvidersJobData): Job<SyncProvidersJobData> {
  return { data, log: vi.fn() } as unknown as Job<SyncProvidersJobData>
}

const deps = { prisma: {} as PrismaClient, tmdbApiKey: 'fake-key' }

describe('createSyncProvidersProcessor', () => {
  afterEach(() => {
    vi.clearAllMocks()
    tmdbIsEnabledMock.mockReturnValue(true)
  })

  it('despacha a TmdbProvider cuando providerSlug=tmdb', async () => {
    tmdbPopularMock.mockResolvedValue({ items: [{ id: 1 }, { id: 2 }] })
    tmdbDetailsMock.mockResolvedValue({ id: 1 })
    tmdbImagesMock.mockResolvedValue(null)
    upsertMock.mockResolvedValue({ mediaId: 'x', created: true })

    const processor = createSyncProvidersProcessor(deps)
    const result = await processor(makeJob({ providerSlug: 'tmdb', mediaType: 'movie', page: 1 }))

    expect(tmdbPopularMock).toHaveBeenCalledWith(1)
    expect(anilistPopularMock).not.toHaveBeenCalled()
    expect(result).toEqual({ synced: 2, failed: 0 })
  })

  it('despacha a AniListProvider cuando providerSlug=anilist', async () => {
    anilistPopularMock.mockResolvedValue({ items: [{ id: 10 }] })
    anilistDetailsMock.mockResolvedValue({ id: 10 })
    upsertMock.mockResolvedValue({ mediaId: 'y', created: true })

    const processor = createSyncProvidersProcessor(deps)
    const result = await processor(makeJob({ providerSlug: 'anilist', mediaType: 'tv', page: 1 }))

    expect(anilistPopularMock).toHaveBeenCalledWith(1)
    expect(tmdbPopularMock).not.toHaveBeenCalled()
    expect(result).toEqual({ synced: 1, failed: 0 })
  })

  it('cuenta como fallido un item cuyo details() devuelve null, sin abortar el resto', async () => {
    anilistPopularMock.mockResolvedValue({ items: [{ id: 1 }, { id: 2 }] })
    anilistDetailsMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2 })
    upsertMock.mockResolvedValue({ mediaId: 'z', created: true })

    const processor = createSyncProvidersProcessor(deps)
    const result = await processor(makeJob({ providerSlug: 'anilist', mediaType: 'tv', page: 1 }))

    expect(result).toEqual({ synced: 1, failed: 1 })
  })

  it('rechaza un providerSlug desconocido', async () => {
    const processor = createSyncProvidersProcessor(deps)
    await expect(
      processor(makeJob({ providerSlug: 'tvmaze', mediaType: 'tv', page: 1 })),
    ).rejects.toThrow(/tmdb.*anilist/)
  })

  it('lanza si TMDB_API_KEY no está configurada para providerSlug=tmdb', async () => {
    tmdbIsEnabledMock.mockReturnValue(false)
    const processor = createSyncProvidersProcessor(deps)
    await expect(
      processor(makeJob({ providerSlug: 'tmdb', mediaType: 'movie', page: 1 })),
    ).rejects.toThrow(/TMDB_API_KEY/)
  })
})

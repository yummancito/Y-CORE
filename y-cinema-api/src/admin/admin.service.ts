import type { PrismaClient, Prisma } from '@prisma/client'
import type { Queues } from '../queue/queues.js'

export interface CatalogStats {
  totalMedia: number
  byType: Record<string, number>
  byProvider: Array<{ providerSlug: string; count: number }>
  openTranslationGaps: number
  failedJobsLast24h: number
}

export interface UpdateMediaInput {
  title?: string
  overview?: string | null
  tagline?: string | null
  popularity?: number
}

export interface AddImageInput {
  type: string
  url: string
  width?: number | null
  height?: number | null
  languageCode?: string | null
}

/** Lógica de negocio del panel admin — separada de las rutas (mismo
 * patrón que el resto de módulos) para poder testear sin pasar por HTTP. */
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queues: Queues,
  ) {}

  async updateMedia(mediaId: string, input: UpdateMediaInput) {
    return this.prisma.media.update({ where: { id: mediaId }, data: input })
  }

  async addImage(mediaId: string, input: AddImageInput) {
    return this.prisma.image.create({
      data: {
        mediaId,
        type: input.type as Prisma.ImageCreateInput['type'],
        url: input.url,
        width: input.width ?? null,
        height: input.height ?? null,
        languageCode: input.languageCode ?? null,
      },
    })
  }

  async removeImage(mediaId: string, imageId: string): Promise<void> {
    await this.prisma.image.deleteMany({ where: { id: imageId, mediaId } })
  }

  async triggerSyncProviders(providerSlug: 'tmdb', mediaType: 'movie' | 'tv', page: number) {
    const job = await this.queues['sync-providers'].add('manual-sync', {
      providerSlug,
      mediaType,
      page,
    })
    return { jobId: job.id }
  }

  async triggerMergeDuplicates(mediaIdA: string, mediaIdB: string) {
    const job = await this.queues['merge-duplicates'].add('manual-merge', { mediaIdA, mediaIdB })
    return { jobId: job.id }
  }

  async triggerRebuildSearchIndex() {
    const job = await this.queues['rebuild-search-index'].add('manual-reindex', {
      reason: 'admin-triggered',
    })
    return { jobId: job.id }
  }

  async listJobs(filters: { queueName?: string; status?: string; limit: number }) {
    return this.prisma.job.findMany({
      where: {
        ...(filters.queueName ? { queueName: filters.queueName } : {}),
        ...(filters.status ? { status: filters.status as Prisma.JobWhereInput['status'] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
    })
  }

  async getStats(): Promise<CatalogStats> {
    const [totalMedia, byTypeRaw, byProviderRaw, openTranslationGaps, failedJobsLast24h] =
      await Promise.all([
        this.prisma.media.count(),
        this.prisma.media.groupBy({ by: ['type'], _count: { _all: true } }),
        this.prisma.mediaProviderRef.groupBy({ by: ['providerId'], _count: { _all: true } }),
        this.prisma.translationGap.count({ where: { resolvedAt: null } }),
        this.prisma.job.count({
          where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ])

    const providers = await this.prisma.provider.findMany({
      where: { id: { in: byProviderRaw.map((p) => p.providerId) } },
    })
    const providerNameById = new Map(providers.map((p) => [p.id, p.slug]))

    return {
      totalMedia,
      byType: Object.fromEntries(byTypeRaw.map((row) => [row.type, row._count._all])),
      byProvider: byProviderRaw.map((row) => ({
        providerSlug: providerNameById.get(row.providerId) ?? 'desconocido',
        count: row._count._all,
      })),
      openTranslationGaps,
      failedJobsLast24h,
    }
  }
}

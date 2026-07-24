import type { Job } from 'bullmq'
import type { ImageType, PrismaClient } from '@prisma/client'
import { FanArtProvider } from '../providers/fanart/fanart.provider.js'
import type { UpdateImagesJobData } from '../queue/queues.js'

export interface UpdateImagesDeps {
  prisma: PrismaClient
  fanartApiKey: string | undefined
}

const FANART_TYPE_TO_IMAGE_TYPE: Record<string, ImageType> = {
  hdmovielogo: 'LOGO',
  hdtvlogo: 'LOGO',
  moviebackground: 'BACKDROP',
  showbackground: 'BACKDROP',
  moviebanner: 'BANNER',
  tvbanner: 'BANNER',
  movieposter: 'POSTER',
  tvposter: 'POSTER',
}

/** Enriquece un media ya existente con imágenes extra de FanArt.tv
 * (logos/banners/backgrounds de mayor calidad que las de TMDB). No crea el
 * media — solo agrega filas a `images` si no existen ya (dedupe por URL,
 * igual criterio que NormalizerService.appendImages en Fase 5). */
export function createUpdateImagesProcessor(deps: UpdateImagesDeps) {
  return async function updateImagesProcessor(
    job: Job<UpdateImagesJobData>,
  ): Promise<{ added: number }> {
    const provider = new FanArtProvider({ apiKey: deps.fanartApiKey, mediaType: job.data.mediaType })

    if (!provider.isEnabled()) {
      job.log('FANART_API_KEY no configurada — job omitido sin error.')
      return { added: 0 }
    }

    const fanart = await provider.images(job.data.tmdbId)

    const existing = await deps.prisma.image.findMany({
      where: { mediaId: job.data.mediaId },
      select: { url: true },
    })
    const existingUrls = new Set(existing.map((i) => i.url))

    const toCreate: Array<{ type: ImageType; url: string }> = []
    for (const [fanartKey, imageType] of Object.entries(FANART_TYPE_TO_IMAGE_TYPE)) {
      const entries = fanart[fanartKey as keyof typeof fanart]
      if (!Array.isArray(entries)) continue
      for (const entry of entries.slice(0, 3)) {
        if (!existingUrls.has(entry.url)) {
          toCreate.push({ type: imageType, url: entry.url })
        }
      }
    }

    if (toCreate.length > 0) {
      await deps.prisma.image.createMany({
        data: toCreate.map((img) => ({
          mediaId: job.data.mediaId,
          type: img.type,
          url: img.url,
          width: null,
          height: null,
          languageCode: null,
        })),
      })
    }

    job.log(`media=${job.data.mediaId}: ${toCreate.length} imágenes nuevas de FanArt.`)
    return { added: toCreate.length }
  }
}

import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import { TranslationService } from '../services/translation/translation.service.js'
import type { UpdateTranslationsJobData } from '../queue/queues.js'

const FIELDS = ['TITLE', 'OVERVIEW', 'TAGLINE'] as const

/** Reintenta resolver los TranslationGap abiertos de un media — se dispara
 * cuando llega contenido nuevo de un proveedor que podría llenar un hueco
 * de idioma detectado antes (ver TranslationService.resolve en Fase 6). Este
 * job no busca traducciones nuevas por sí mismo (eso es responsabilidad de
 * sync-providers al normalizar): solo re-evalúa si los gaps existentes ya
 * se resolvieron con datos que llegaron después. */
export function createUpdateTranslationsProcessor(prisma: PrismaClient) {
  return async function updateTranslationsProcessor(
    job: Job<UpdateTranslationsJobData>,
  ): Promise<{ resolved: number; stillMissing: number }> {
    const service = new TranslationService(prisma)
    let resolved = 0
    let stillMissing = 0

    for (const field of FIELDS) {
      const result = await service.resolve(job.data.mediaId, field)
      if (result) resolved += 1
      else stillMissing += 1
    }

    job.log(`media=${job.data.mediaId}: ${resolved} resueltos, ${stillMissing} sin resolver.`)
    return { resolved, stillMissing }
  }
}

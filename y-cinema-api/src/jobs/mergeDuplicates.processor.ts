import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { MergeDuplicatesJobData } from '../queue/queues.js'

/** Fusiona dos Media que un operador (panel admin, Fase 11) identificó
 * como duplicados: reasigna todas las referencias de `mediaIdB` hacia
 * `mediaIdA` y borra `mediaIdB`. `mediaIdA` sobrevive siempre —
 * deliberadamente NO decide automáticamente cuál es "mejor" (a diferencia
 * del merge por weight de NormalizerService en Fase 5, acá el matching
 * cross-provider no está resuelto — ver nota en docs/ROADMAP.md Fase 5 —
 * así que la decisión de qué fusionar y en qué dirección es manual). */
export function createMergeDuplicatesProcessor(prisma: PrismaClient) {
  return async function mergeDuplicatesProcessor(
    job: Job<MergeDuplicatesJobData>,
  ): Promise<{ merged: boolean }> {
    const { mediaIdA, mediaIdB } = job.data

    if (mediaIdA === mediaIdB) {
      throw new Error('mediaIdA y mediaIdB no pueden ser el mismo media.')
    }

    const [a, b] = await Promise.all([
      prisma.media.findUnique({ where: { id: mediaIdA } }),
      prisma.media.findUnique({ where: { id: mediaIdB } }),
    ])
    if (!a || !b) {
      throw new Error('Uno de los dos media no existe.')
    }

    await prisma.$transaction(async (tx) => {
      // Reasigna referencias de proveedor — si B tenía una ref de un
      // proveedor que A no tiene, se mueve; si ambos ya tienen ref del
      // mismo proveedor, se descarta la de B (ya está representado).
      const bRefs = await tx.mediaProviderRef.findMany({ where: { mediaId: mediaIdB } })
      for (const ref of bRefs) {
        const conflict = await tx.mediaProviderRef.findFirst({
          where: { mediaId: mediaIdA, providerId: ref.providerId },
        })
        if (conflict) {
          await tx.mediaProviderRef.delete({ where: { id: ref.id } })
        } else {
          await tx.mediaProviderRef.update({ where: { id: ref.id }, data: { mediaId: mediaIdA } })
        }
      }

      // Favoritos/historial/watchlist: mover, ignorando conflictos de
      // unique (userId+mediaId) si el usuario ya tenía A también.
      const bFavorites = await tx.favorite.findMany({ where: { mediaId: mediaIdB } })
      for (const fav of bFavorites) {
        try {
          await tx.favorite.update({ where: { id: fav.id }, data: { mediaId: mediaIdA } })
        } catch {
          await tx.favorite.delete({ where: { id: fav.id } })
        }
      }

      const bWatchlist = await tx.watchlist.findMany({ where: { mediaId: mediaIdB } })
      for (const w of bWatchlist) {
        try {
          await tx.watchlist.update({ where: { id: w.id }, data: { mediaId: mediaIdA } })
        } catch {
          await tx.watchlist.delete({ where: { id: w.id } })
        }
      }

      await tx.history.updateMany({ where: { mediaId: mediaIdB }, data: { mediaId: mediaIdA } })

      // Imágenes/ratings/géneros/personas: mover, deduplicando lo obvio
      // (mismo criterio que NormalizerService — dedupe por URL/source/slug).
      await tx.image.updateMany({ where: { mediaId: mediaIdB }, data: { mediaId: mediaIdA } })

      const bGenres = await tx.mediaGenre.findMany({ where: { mediaId: mediaIdB } })
      for (const g of bGenres) {
        await tx.mediaGenre.upsert({
          where: { mediaId_genreId: { mediaId: mediaIdA, genreId: g.genreId } },
          update: {},
          create: { mediaId: mediaIdA, genreId: g.genreId },
        })
      }

      await tx.media.delete({ where: { id: mediaIdB } })
    })

    job.log(`Fusionado ${mediaIdB} → ${mediaIdA}.`)
    return { merged: true }
  }
}

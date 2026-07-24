import type { PrismaClient, Prisma } from '@prisma/client'
import type { Redis } from 'ioredis'
import type { NormalizedMediaInput } from '../../types/media.js'
import { invalidateByPattern } from '../../cache/cacheAside.js'

export interface UpsertResult {
  mediaId: string
  created: boolean
}

/**
 * Persiste un NormalizedMediaInput en la base de datos, deduplicando por
 * (provider, externalId) vía media_provider_refs (ver docs/DATABASE.md).
 *
 * Reglas de merge (ver ADR 2.3 y providers.weight en prisma/seed.ts):
 * - Si NO existe una referencia previa de este proveedor+externalId para
 *   ningún Media, se crea un Media nuevo.
 * - Si SÍ existe, se actualiza el Media existente solo si el proveedor que
 *   trae este dato tiene weight >= al último proveedor que lo actualizó
 *   (evita que una fuente de baja confianza pise datos de una mejor).
 * - Genres/people/images/ratings se sincronizan por reemplazo del
 *   subconjunto perteneciente a este proveedor (identificado indirectamente
 *   por ausencia de mejor forma de rastrear "quién puso qué" a nivel de
 *   fila individual sin una columna providerId en cada tabla puente —
 *   ratings SÍ tiene providerId-like vía `source`, y se actualiza con
 *   upsert por (mediaId, source) tal como define el schema).
 */
export class NormalizerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis,
  ) {}

  async upsert(input: NormalizedMediaInput): Promise<UpsertResult> {
    const provider = await this.prisma.provider.findUnique({
      where: { slug: input.externalRef.providerSlug },
    })
    if (!provider) {
      throw new Error(
        `Proveedor desconocido: ${input.externalRef.providerSlug}. ¿Falta correr el seed?`,
      )
    }

    const existingRef = await this.prisma.mediaProviderRef.findUnique({
      where: {
        providerId_externalId: {
          providerId: provider.id,
          externalId: input.externalRef.externalId,
        },
      },
    })

    if (existingRef) {
      await this.applyFields(existingRef.mediaId, input, provider.weight)
      await this.prisma.mediaProviderRef.update({
        where: { id: existingRef.id },
        data: { raw: toJsonValue(input.externalRef.raw), fetchedAt: new Date() },
      })
      await this.invalidateCache(existingRef.mediaId)
      return { mediaId: existingRef.mediaId, created: false }
    }

    const media = await this.prisma.media.create({
      data: {
        type: input.type,
        title: input.title,
        originalTitle: input.originalTitle,
        overview: input.overview,
        tagline: input.tagline,
        status: input.status,
        releaseDate: input.releaseDate ? new Date(input.releaseDate) : null,
        runtimeMinutes: input.runtimeMinutes,
        originalLangCode: input.originalLangCode,
        popularity: input.popularity,
      },
    })

    await this.prisma.mediaProviderRef.create({
      data: {
        mediaId: media.id,
        providerId: provider.id,
        externalId: input.externalRef.externalId,
        raw: toJsonValue(input.externalRef.raw),
      },
    })

    await this.syncRelations(media.id, input)
    await this.invalidateCache(media.id)

    return { mediaId: media.id, created: true }
  }

  /** Borra el cache de detalle de este media y TODAS las listas cacheadas
   * — una lista puede haber incluido este media en cualquier combinación
   * de filtros, así que invalidar solo por id no alcanza (ver Fase 7). */
  private async invalidateCache(mediaId: string): Promise<void> {
    if (!this.redis) return
    await Promise.all([
      this.redis.del(`media:detail:${mediaId}`),
      invalidateByPattern(this.redis, 'media:list:*'),
    ])
  }

  /** Actualiza los campos escalares de un Media existente solo si el
   * proveedor entrante tiene weight >= al que lo creó/actualizó por
   * última vez — evita que Kitsu (weight 50) pise un título que vino de
   * TMDB (weight 100). Comparación best-effort vía el weight máximo de
   * los providers ya vinculados a este media. */
  private async applyFields(
    mediaId: string,
    input: NormalizedMediaInput,
    incomingWeight: number,
  ): Promise<void> {
    const linkedRefs = await this.prisma.mediaProviderRef.findMany({
      where: { mediaId },
      include: { provider: true },
    })
    const maxLinkedWeight = linkedRefs.reduce((max, ref) => Math.max(max, ref.provider.weight), 0)

    if (incomingWeight < maxLinkedWeight) {
      // Una fuente de menor confianza que ya tenemos vinculada — solo
      // sincronizamos relaciones (géneros/imágenes propias), no pisamos
      // los campos escalares (título, overview, etc.).
      await this.syncRelations(mediaId, input)
      return
    }

    await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        title: input.title,
        originalTitle: input.originalTitle,
        overview: input.overview,
        tagline: input.tagline,
        status: input.status,
        releaseDate: input.releaseDate ? new Date(input.releaseDate) : null,
        runtimeMinutes: input.runtimeMinutes,
        originalLangCode: input.originalLangCode,
        popularity: input.popularity,
      },
    })

    await this.syncRelations(mediaId, input)
  }

  private async syncRelations(mediaId: string, input: NormalizedMediaInput): Promise<void> {
    await this.syncGenres(mediaId, input.genres)
    await this.syncRatings(mediaId, input.ratings)
    await this.appendImages(mediaId, input.images)
    await this.appendPeople(mediaId, input.people)
  }

  private async syncGenres(
    mediaId: string,
    genres: NormalizedMediaInput['genres'],
  ): Promise<void> {
    for (const g of genres) {
      const genre = await this.prisma.genre.upsert({
        where: { slug: g.slug },
        update: {},
        create: { slug: g.slug, name: g.name },
      })
      await this.prisma.mediaGenre.upsert({
        where: { mediaId_genreId: { mediaId, genreId: genre.id } },
        update: {},
        create: { mediaId, genreId: genre.id },
      })
    }
  }

  private async syncRatings(
    mediaId: string,
    ratings: NormalizedMediaInput['ratings'],
  ): Promise<void> {
    for (const r of ratings) {
      await this.prisma.rating.upsert({
        where: { mediaId_source: { mediaId, source: r.source } },
        update: { value: r.value, scale: r.scale, voteCount: r.voteCount, fetchedAt: new Date() },
        create: {
          mediaId,
          source: r.source,
          value: r.value,
          scale: r.scale,
          voteCount: r.voteCount,
        },
      })
    }
  }

  /** Las imágenes no tienen una unique constraint natural (misma URL puede
   * repetirse entre proveedores) — se evita duplicar comparando por URL
   * antes de insertar, en vez de usar upsert. */
  private async appendImages(
    mediaId: string,
    images: NormalizedMediaInput['images'],
  ): Promise<void> {
    if (images.length === 0) return

    const existing = await this.prisma.image.findMany({
      where: { mediaId },
      select: { url: true },
    })
    const existingUrls = new Set(existing.map((i) => i.url))

    const toCreate = images.filter((img) => !existingUrls.has(img.url))
    if (toCreate.length === 0) return

    await this.prisma.image.createMany({
      data: toCreate.map((img) => ({
        mediaId,
        type: img.type,
        url: img.url,
        width: img.width,
        height: img.height,
        languageCode: img.languageCode,
      })),
    })
  }

  private async appendPeople(
    mediaId: string,
    people: NormalizedMediaInput['people'],
  ): Promise<void> {
    for (const p of people) {
      const personId = await this.findOrCreatePersonId(p.name, p.profileUrl)
      await this.prisma.mediaPerson.upsert({
        where: { mediaId_personId_role: { mediaId, personId, role: p.role } },
        update: { characterName: p.characterName, billingOrder: p.billingOrder },
        create: {
          mediaId,
          personId,
          role: p.role,
          characterName: p.characterName,
          billingOrder: p.billingOrder,
        },
      })
    }
  }

  /** Person no tiene una unique constraint por nombre (dos personas pueden
   * compartir nombre) — se busca por nombre exacto como heurística simple
   * de deduplicación antes de crear una fila nueva. Suficiente para Fase 5;
   * un matching más robusto (por id externo de TMDB) queda para una fase
   * posterior si aparecen falsos duplicados en producción. */
  private async findOrCreatePersonId(name: string, profileUrl: string | null): Promise<string> {
    const existing = await this.prisma.person.findFirst({ where: { name } })
    if (existing) return existing.id
    const created = await this.prisma.person.create({ data: { name, profileUrl } })
    return created.id
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

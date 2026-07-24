import type { PrismaClient } from '@prisma/client'
import type { TranslatableField } from '../../types/media.js'

// Cascada de prioridad fija del ADR (sección 2.4): español primero,
// inglés si no hay español, y como último recurso el idioma original del
// contenido (que puede no ser ninguno de los dos, p.ej. japonés).
const PREFERRED_LANGUAGE_ORDER = ['es', 'en'] as const

export interface RecordTranslationInput {
  mediaId: string
  languageCode: string
  field: TranslatableField
  value: string
  providerSlug: string | null
  quality?: number
}

export interface ResolvedTranslation {
  value: string
  languageCode: string
  /** true si tuvo que caer al idioma original por falta de ES/EN. */
  isFallback: boolean
}

/** Implementa la cascada de idiomas del ADR: toda lectura de un campo
 * traducible pasa por `resolve()`, que intenta ES, luego EN, luego el
 * idioma original — y registra un TranslationGap si ninguno existe, para
 * que un job futuro (Fase 9) intente completarlo. Nunca se lee `media.title`
 * directo para mostrar al usuario — ese campo es solo un cache
 * desnormalizado del último proveedor que escribió, no el resultado de la
 * cascada de idiomas. */
export class TranslationService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Guarda una traducción — nunca sobrescribe una entrada existente con
   * `quality` menor o igual (append-only por diseño, ver docs/DATABASE.md). */
  async record(input: RecordTranslationInput): Promise<void> {
    const language = await this.prisma.language.findUnique({
      where: { code: input.languageCode },
    })
    if (!language) {
      throw new Error(`Idioma desconocido: ${input.languageCode}. ¿Falta en el seed?`)
    }

    const provider = input.providerSlug
      ? await this.prisma.provider.findUnique({ where: { slug: input.providerSlug } })
      : null

    const quality = input.quality ?? estimateQuality(input.value)
    const providerId = provider?.id ?? null

    // No se puede usar el unique compuesto (mediaId, languageId, field,
    // providerId) vía upsert() cuando providerId es null — Postgres trata
    // cada NULL como distinto de cualquier otro en una unique constraint,
    // así que Prisma no genera un accessor `findUnique`/`upsert` que acepte
    // null ahí. Se resuelve con find-then-write explícito.
    const existing = await this.prisma.translation.findFirst({
      where: { mediaId: input.mediaId, languageId: language.id, field: input.field, providerId },
    })

    if (existing && existing.quality >= quality) {
      // Ya tenemos algo igual o mejor de esta misma combinación
      // proveedor+idioma+campo — no lo pisamos (ver ADR 2.4: "nunca
      // sobrescribir información mejor").
      return
    }

    if (existing) {
      await this.prisma.translation.update({
        where: { id: existing.id },
        data: { value: input.value, quality },
      })
    } else {
      await this.prisma.translation.create({
        data: {
          mediaId: input.mediaId,
          languageId: language.id,
          field: input.field,
          value: input.value,
          providerId,
          quality,
        },
      })
    }

    // Si esto llena un hueco previamente registrado, lo marcamos resuelto
    // en vez de dejarlo huérfano para que un job lo siga reintentando.
    await this.prisma.translationGap.updateMany({
      where: {
        mediaId: input.mediaId,
        field: input.field,
        wantedLng: input.languageCode,
        resolvedAt: null,
      },
      data: { resolvedAt: new Date() },
    })
  }

  /** Resuelve el mejor valor disponible para (media, field) siguiendo
   * ES → EN → idioma original del media. Si no encuentra ninguno, registra
   * un TranslationGap (si no existe uno abierto ya) y devuelve null. */
  async resolve(mediaId: string, field: TranslatableField): Promise<ResolvedTranslation | null> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { originalLangCode: true },
    })
    if (!media) {
      throw new Error(`No existe media con id ${mediaId}.`)
    }

    const candidateCodes: string[] = [...PREFERRED_LANGUAGE_ORDER]
    if (media.originalLangCode && !candidateCodes.includes(media.originalLangCode)) {
      candidateCodes.push(media.originalLangCode)
    }

    for (const code of candidateCodes) {
      const best = await this.bestTranslationFor(mediaId, field, code)
      if (best) {
        return {
          value: best.value,
          languageCode: code,
          isFallback: code !== PREFERRED_LANGUAGE_ORDER[0],
        }
      }
    }

    await this.recordGap(mediaId, field, PREFERRED_LANGUAGE_ORDER[0])
    return null
  }

  /** Entre todas las traducciones guardadas (de distintos proveedores) para
   * un mismo idioma+campo, devuelve la de mayor `quality`. */
  private async bestTranslationFor(
    mediaId: string,
    field: TranslatableField,
    languageCode: string,
  ) {
    const language = await this.prisma.language.findUnique({ where: { code: languageCode } })
    if (!language) return null

    return this.prisma.translation.findFirst({
      where: { mediaId, field, languageId: language.id },
      orderBy: { quality: 'desc' },
    })
  }

  private async recordGap(
    mediaId: string,
    field: TranslatableField,
    wantedLng: string,
  ): Promise<void> {
    const openGap = await this.prisma.translationGap.findFirst({
      where: { mediaId, field, wantedLng, resolvedAt: null },
    })
    if (openGap) return

    await this.prisma.translationGap.create({ data: { mediaId, field, wantedLng } })
  }
}

/** Heurística simple de calidad cuando el caller no la especifica: texto
 * más largo y no vacío puntúa más alto — una sinopsis de 400 caracteres es
 * mejor candidata que un placeholder de 10. Ver ADR 2.4. */
function estimateQuality(value: string): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 0
  return Math.min(trimmed.length, 1000)
}

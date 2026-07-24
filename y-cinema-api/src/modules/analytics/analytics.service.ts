import type { PrismaClient } from '@prisma/client'
import type { AnalyticsEventType, RecordEventInput } from './analytics.types.js'

const EVENT_PREFIX = 'analytics:'

export interface TopEntry {
  subject: string
  count: number
}

/** Registro y agregación de eventos de uso (búsquedas, vistas, favoritos).
 * Se apoya en la tabla `logs` genérica (ver prisma/schema.prisma) en vez de
 * crear una tabla dedicada — a la escala esperada (ver ADR), agregar sobre
 * JSONB con `meta->>'subject'` es suficiente y evita una migración nueva
 * solo para este propósito. Cada evento se guarda con `level: INFO` y un
 * prefijo fijo en `message` para poder filtrarlos sin ambigüedad frente a
 * logs de aplicación no relacionados con analytics. */
export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  async recordEvent(input: RecordEventInput): Promise<void> {
    await this.prisma.log.create({
      data: {
        level: 'INFO',
        message: `${EVENT_PREFIX}${input.type}`,
        meta: { type: input.type, subject: input.subject, userId: input.userId ?? null },
      },
    })
  }

  /** Top N valores de `subject` para un tipo de evento dado, en la
   * ventana de tiempo pedida — usa una raw query porque Prisma no expresa
   * "agrupar por un campo dentro de JSONB" con su query builder. */
  async getTop(type: AnalyticsEventType, sinceDays: number, limit: number): Promise<TopEntry[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)

    const rows = await this.prisma.$queryRaw<Array<{ subject: string; count: bigint }>>`
      SELECT meta->>'subject' AS subject, COUNT(*) AS count
      FROM logs
      WHERE message = ${EVENT_PREFIX + type}
        AND created_at >= ${since}
      GROUP BY meta->>'subject'
      ORDER BY count DESC
      LIMIT ${limit}
    `

    return rows.map((r) => ({ subject: r.subject, count: Number(r.count) }))
  }

  async getEventCount(type: AnalyticsEventType, sinceDays: number): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    return this.prisma.log.count({
      where: { message: `${EVENT_PREFIX}${type}`, createdAt: { gte: since } },
    })
  }
}

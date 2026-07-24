import type { Job as BullJob, Processor } from 'bullmq'
import type { PrismaClient } from '@prisma/client'

/** Envuelve un processor de BullMQ para que cada ejecución quede
 * registrada en la tabla `jobs` (historial auditable de largo plazo,
 * distinto del estado efímero que BullMQ ya mantiene en Redis — ver
 * comentario en prisma/schema.prisma). Se aplica en registerWorkers() en
 * vez de duplicar este código en cada uno de los 7 *.processor.ts. */
export function withJobAudit<T>(
  prisma: PrismaClient,
  queueName: string,
  processor: Processor<T>,
): Processor<T> {
  return async (job: BullJob<T>) => {
    const record = await prisma.job.create({
      data: {
        queueName,
        type: job.name,
        status: 'RUNNING',
        payload: toJsonValue(job.data),
        startedAt: new Date(),
      },
    })

    try {
      const result = await processor(job, undefined as never)
      await prisma.job.update({
        where: { id: record.id },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      })
      return result
    } catch (err) {
      await prisma.job.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        },
      })
      throw err
    }
  }
}

function toJsonValue(value: unknown): object | undefined {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as object
}

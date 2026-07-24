import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { AnalyticsService } from '../../src/modules/analytics/analytics.service.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('AnalyticsService', () => {
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  const marker = `test-marker-${Date.now()}`

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
    if (!infraAvailable) return
    prisma = new PrismaClient()
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.log.deleteMany({ where: { message: { contains: marker } } }).catch(() => {})
    }
    await prisma?.$disconnect()
  })

  it('recordEvent() persiste el evento en logs con el subject correcto', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 12.')
      return
    }
    const service = new AnalyticsService(prisma)
    await service.recordEvent({ type: 'search', subject: `${marker}-matrix` })

    const row = await prisma.log.findFirst({ where: { message: 'analytics:search' }, orderBy: { createdAt: 'desc' } })
    expect(row).not.toBeNull()
    expect((row?.meta as { subject: string })?.subject).toBe(`${marker}-matrix`)
  })

  it('getTop() agrega correctamente por subject, ordenado por frecuencia', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 12.')
      return
    }
    const service = new AnalyticsService(prisma)
    const popularSubject = `${marker}-popular`
    const rareSubject = `${marker}-rare`

    await service.recordEvent({ type: 'view', subject: popularSubject })
    await service.recordEvent({ type: 'view', subject: popularSubject })
    await service.recordEvent({ type: 'view', subject: popularSubject })
    await service.recordEvent({ type: 'view', subject: rareSubject })

    const top = await service.getTop('view', 1, 10)
    const popularEntry = top.find((t) => t.subject === popularSubject)
    const rareEntry = top.find((t) => t.subject === rareSubject)

    expect(popularEntry?.count).toBe(3)
    expect(rareEntry?.count).toBe(1)
    expect(top.indexOf(popularEntry!)).toBeLessThan(top.indexOf(rareEntry!))
  })

  it('getEventCount() cuenta solo eventos del tipo pedido', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 12.')
      return
    }
    const service = new AnalyticsService(prisma)
    const before = await service.getEventCount('favorite', 1)

    await service.recordEvent({ type: 'favorite', subject: `${marker}-fav` })

    const after = await service.getEventCount('favorite', 1)
    expect(after).toBe(before + 1)
  })
})

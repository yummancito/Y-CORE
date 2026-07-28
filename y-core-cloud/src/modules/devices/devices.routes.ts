// ============================================================================
// src/modules/devices/devices.routes.ts
// ----------------------------------------------------------------------------
// Devices routes — register, list, trust, untrust, remove.
// All routes require authentication.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  registerDevice,
  listDevices,
  trustDevice,
  untrustDevice,
  removeDevice,
  getTrustedDevices,
} from './devices.service.js'

const registerSchema = z.object({
  name: z.string().min(1, 'Nombre del dispositivo requerido.'),
  platform: z.enum(['ANDROID', 'IOS', 'WINDOWS', 'MAC', 'LINUX', 'WEB']).default('ANDROID'),
  pushToken: z.string().optional(),
})

export async function devicesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate)

  // ── Register device ──
  app.post('/', async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const device = await registerDevice(app.prisma, request.userId!, input)
    reply.status(201).send({ device })
  })

  // ── List my devices ──
  app.get('/', async (request, reply) => {
    const devices = await listDevices(app.prisma, request.userId!)
    reply.send({ devices })
  })

  // ── Get trusted devices ──
  app.get('/trusted', async (request, reply) => {
    const devices = await getTrustedDevices(app.prisma, request.userId!)
    reply.send({ devices })
  })

  // ── Trust device ──
  app.post('/:deviceId/trust', async (request, reply) => {
    const { deviceId } = z.object({ deviceId: z.string().uuid() }).parse(request.params)
    const device = await trustDevice(app.prisma, deviceId, request.userId!)
    if (!device) {
      reply.notFound('Dispositivo no encontrado.')
      return
    }
    reply.send({ device })
  })

  // ── Untrust device ──
  app.post('/:deviceId/untrust', async (request, reply) => {
    const { deviceId } = z.object({ deviceId: z.string().uuid() }).parse(request.params)
    const ok = await untrustDevice(app.prisma, deviceId, request.userId!)
    if (!ok) {
      reply.notFound('Dispositivo no encontrado.')
      return
    }
    reply.status(204).send()
  })

  // ── Remove device ──
  app.delete('/:deviceId', async (request, reply) => {
    const { deviceId } = z.object({ deviceId: z.string().uuid() }).parse(request.params)
    const ok = await removeDevice(app.prisma, deviceId, request.userId!)
    if (!ok) {
      reply.notFound('Dispositivo no encontrado.')
      return
    }
    reply.status(204).send()
  })
}

// ============================================================================
// src/modules/hosts/hosts.routes.ts
// ----------------------------------------------------------------------------
// Hosts routes — register, heartbeat, list, get.
// All routes require authentication.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  registerHost,
  sendHeartbeat,
  unregisterHost,
  listMyHosts,
  getHostById,
  getOnlineHosts,
} from './hosts.service.js'

const registerSchema = z.object({
  name: z.string().min(1, 'Nombre del host requerido.'),
  os: z.string().default(''),
  version: z.string().default(''),
  publicIp: z.string().default(''),
  capabilities: z.array(z.string()).default([]),
  gameCount: z.number().int().default(0),
})

const heartbeatSchema = z.object({
  publicIp: z.string().optional(),
})

export async function hostsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate)

  // ── Register host ──
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const host = await registerHost(app.prisma, request.userId!, input)
    reply.status(201).send({ host })
  })

  // ── Heartbeat ──
  app.post('/:hostId/heartbeat', async (request, reply) => {
    const { hostId } = z.object({ hostId: z.string().uuid() }).parse(request.params)
    const { publicIp } = heartbeatSchema.parse(request.body)
    const host = await sendHeartbeat(app.prisma, hostId, request.userId!, publicIp)
    if (!host) {
      reply.notFound('Host no encontrado.')
      return
    }
    reply.send({ host, status: 'ok' })
  })

  // ── Unregister host ──
  app.delete('/:hostId', async (request, reply) => {
    const { hostId } = z.object({ hostId: z.string().uuid() }).parse(request.params)
    await unregisterHost(app.prisma, hostId, request.userId!)
    reply.status(204).send()
  })

  // ── List my hosts ──
  app.get('/my-hosts', async (request, reply) => {
    const hosts = await listMyHosts(app.prisma, request.userId!)
    reply.send({ hosts })
  })

  // ── Get online hosts ──
  app.get('/online', async (request, reply) => {
    const hosts = await getOnlineHosts(app.prisma, request.userId!)
    reply.send({ hosts })
  })

  // ── Get host by ID ──
  app.get('/:hostId', async (request, reply) => {
    const { hostId } = z.object({ hostId: z.string().uuid() }).parse(request.params)
    const host = await getHostById(app.prisma, hostId, request.userId!)
    if (!host) {
      reply.notFound('Host no encontrado.')
      return
    }
    reply.send({ host })
  })
}

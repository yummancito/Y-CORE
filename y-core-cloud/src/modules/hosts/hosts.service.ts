// ============================================================================
// src/modules/hosts/hosts.service.ts
// ----------------------------------------------------------------------------
// Hosts service — register PC, heartbeat, list my hosts, offline detection.
// ============================================================================

import type { PrismaClient, Host } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

export interface RegisterHostInput {
  name: string
  os: string
  version: string
  publicIp: string
  capabilities: string[]
  gameCount: number
}

export async function registerHost(
  prisma: PrismaClient,
  userId: string,
  input: RegisterHostInput,
): Promise<Host> {
  const host = await prisma.host.create({
    data: {
      userId,
      name: input.name,
      os: input.os,
      version: input.version,
      publicIp: input.publicIp,
      capabilities: input.capabilities,
      gameCount: input.gameCount,
      status: 'ONLINE',
      lastHeartbeatAt: new Date(),
    },
  })
  return host
}

export async function sendHeartbeat(
  prisma: PrismaClient,
  hostId: string,
  userId: string,
  publicIp?: string,
): Promise<Host | null> {
  const updateData: Record<string, unknown> = {
    status: 'ONLINE',
    lastHeartbeatAt: new Date(),
  }
  if (publicIp) {
    updateData.publicIp = publicIp
  }

  const host = await prisma.host.update({
    where: { id: hostId, userId },
    data: updateData as any,
  })
  return host
}

export async function unregisterHost(
  prisma: PrismaClient,
  hostId: string,
  userId: string,
): Promise<void> {
  await prisma.host.update({
    where: { id: hostId, userId },
    data: { status: 'OFFLINE' },
  })
}

export async function listMyHosts(
  prisma: PrismaClient,
  userId: string,
): Promise<Host[]> {
  const hosts = await prisma.host.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })
  return hosts
}

export async function getHostById(
  prisma: PrismaClient,
  hostId: string,
  userId: string,
): Promise<Host | null> {
  const host = await prisma.host.findFirst({
    where: { id: hostId, userId },
  })
  return host
}

/**
 * Mark hosts as OFFLINE if they haven't sent a heartbeat within the timeout.
 * Called periodically by a background job.
 */
export async function markStaleHostsOffline(
  prisma: PrismaClient,
  timeoutSeconds: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutSeconds * 1000)
  const result = await prisma.host.updateMany({
    where: {
      status: 'ONLINE',
      lastHeartbeatAt: { lt: cutoff },
    },
    data: { status: 'OFFLINE' },
  })
  return result.count
}

/**
 * Get hosts that are currently ONLINE for connection requests.
 */
export async function getOnlineHosts(
  prisma: PrismaClient,
  userId: string,
): Promise<Host[]> {
  const hosts = await prisma.host.findMany({
    where: { userId, status: 'ONLINE' },
    orderBy: { updatedAt: 'desc' },
  })
  return hosts
}

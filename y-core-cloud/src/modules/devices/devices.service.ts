// ============================================================================
// src/modules/devices/devices.service.ts
// ----------------------------------------------------------------------------
// Devices service — manage authorized devices, trust/remove.
// ============================================================================

import type { PrismaClient, Device } from '@prisma/client'
import type { DevicePlatform } from '@prisma/client'

export interface RegisterDeviceInput {
  name: string
  platform: DevicePlatform
  pushToken?: string
}

export async function registerDevice(
  prisma: PrismaClient,
  userId: string,
  input: RegisterDeviceInput,
): Promise<Device> {
  const device = await prisma.device.create({
    data: {
      userId,
      name: input.name,
      platform: input.platform,
      pushToken: input.pushToken,
      lastConnectedAt: new Date(),
    },
  })
  return device
}

export async function listDevices(
  prisma: PrismaClient,
  userId: string,
): Promise<Device[]> {
  return prisma.device.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function trustDevice(
  prisma: PrismaClient,
  deviceId: string,
  userId: string,
): Promise<Device | null> {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
  })
  if (!device) return null

  return prisma.device.update({
    where: { id: deviceId },
    data: { trusted: true, trustedAt: new Date() },
  })
}

export async function untrustDevice(
  prisma: PrismaClient,
  deviceId: string,
  userId: string,
): Promise<boolean> {
  const result = await prisma.device.updateMany({
    where: { id: deviceId, userId },
    data: { trusted: false, trustedAt: null },
  })
  return result.count > 0
}

export async function removeDevice(
  prisma: PrismaClient,
  deviceId: string,
  userId: string,
): Promise<boolean> {
  const result = await prisma.device.deleteMany({
    where: { id: deviceId, userId },
  })
  return result.count > 0
}

export async function getTrustedDevices(
  prisma: PrismaClient,
  userId: string,
): Promise<Device[]> {
  return prisma.device.findMany({
    where: { userId, trusted: true },
    orderBy: { updatedAt: 'desc' },
  })
}

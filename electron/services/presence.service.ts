// ============================================================================
// electron/services/presence.service.ts
// ----------------------------------------------------------------------------
// Presence Service — registers the PC as a Remote Play host on the backend
// server, maintains heartbeat, and handles incoming connection requests.
//
// ARCHITECTURE:
//   login() → registerHost() → server registers PC
//   setInterval 30s → sendHeartbeat()
//   logout() → unregisterHost()
//   server sends connection_request → show UI → accept/reject
// ============================================================================

import { logger } from '../logger'
import type {
  HostRegistration,
  ConnectionRequest,
  DeviceInfo,
} from '../common/ipc-contract'

// ── Constants ──────────────────────────────────────────────────────────────

const API_BASE = process.env.YCORE_API_URL || 'https://y-core-render-api-6jbv.onrender.com'
const HEARTBEAT_INTERVAL_MS = 30000
const API_TIMEOUT_MS = 10000

// ── State ──────────────────────────────────────────────────────────────────

let currentRegistration: HostRegistration | null = null
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let pendingRequests: ConnectionRequest[] = []
let trustedDevices: DeviceInfo[] = []

// Callback to notify the renderer of incoming connection requests
let onConnectionRequestCallback: ((request: ConnectionRequest) => void) | null = null

// ── Helpers ────────────────────────────────────────────────────────────────

function getDeviceInfo(): { name: string; os: string; version: string } {
  const os = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'macOS'
    : process.platform === 'linux' ? 'Linux' : 'Unknown'

  return {
    name: `PC - ${os}`,
    os,
    version: process.env.npm_package_version || '1.0.0',
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`HTTP ${resp.status}: ${body}`)
    }
    return resp.json() as T
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Register this PC as a remote play host on the backend server.
 * Starts the heartbeat interval.
 */
export async function registerHost(
  name: string,
  username?: string,
): Promise<HostRegistration> {
  const { os, version } = getDeviceInfo()

  const registration = await apiFetch<HostRegistration>('/api/remote-play/hosts/register', {
    method: 'POST',
    body: JSON.stringify({
      name: name || getDeviceInfo().name,
      os,
      version,
      username,
    }),
  })

  currentRegistration = registration

  // Start heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
  }
  heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch((err) => {
      logger.warn(`[Presence] Heartbeat failed: ${err.message}`, 'remote-play')
    })
  }, HEARTBEAT_INTERVAL_MS)

  logger.info(`[Presence] Host registered: ${registration.hostId} (${registration.name})`, 'remote-play')
  return registration
}

/**
 * Send heartbeat to keep the host alive on the server.
 */
export async function sendHeartbeat(): Promise<void> {
  if (!currentRegistration) return

  try {
    await apiFetch(`/api/remote-play/hosts/${currentRegistration.hostId}/heartbeat`, {
      method: 'POST',
    })
  } catch (err: any) {
    logger.warn(`[Presence] Heartbeat error: ${err.message}`, 'remote-play')
  }
}

/**
 * Unregister this PC from the backend server.
 * Stops the heartbeat interval.
 */
export async function unregisterHost(): Promise<void> {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }

  if (currentRegistration) {
    try {
      await apiFetch(`/api/remote-play/hosts/${currentRegistration.hostId}/unregister`, {
        method: 'POST',
      })
      logger.info(`[Presence] Host unregistered: ${currentRegistration.hostId}`, 'remote-play')
    } catch (err: any) {
      logger.warn(`[Presence] Unregister error: ${err.message}`, 'remote-play')
    }
    currentRegistration = null
  }
}

/**
 * Get pending connection requests from the backend.
 */
export async function getPendingRequests(): Promise<ConnectionRequest[]> {
  if (!currentRegistration) return []

  try {
    const data = await apiFetch<{ requests: ConnectionRequest[] }>(
      `/api/remote-play/hosts/${currentRegistration.hostId}/requests`,
    )
    pendingRequests = data.requests || []
    return pendingRequests
  } catch (err: any) {
    logger.warn(`[Presence] Get requests error: ${err.message}`, 'remote-play')
    return []
  }
}

/**
 * Respond to a connection request (accept/reject).
 * If rememberDevice is true, the device is added to trusted devices list.
 */
export async function respondToRequest(
  requestId: string,
  accept: boolean,
  rememberDevice?: boolean,
): Promise<void> {
  if (!currentRegistration) throw new Error('Not registered')

  await apiFetch(`/api/remote-play/hosts/${currentRegistration.hostId}/requests/${requestId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept, rememberDevice }),
  })

  // Notify the renderer
  const request = pendingRequests.find((r) => r.id === requestId)
  if (request && onConnectionRequestCallback) {
    onConnectionRequestCallback({
      ...request,
      status: accept ? 'accepted' : 'rejected',
    })
  }

  pendingRequests = pendingRequests.filter((r) => r.id !== requestId)
}

/**
 * Get the list of trusted devices.
 */
export async function getTrustedDevices(): Promise<DeviceInfo[]> {
  if (!currentRegistration) return []

  try {
    const data = await apiFetch<{ devices: DeviceInfo[] }>(
      `/api/remote-play/hosts/${currentRegistration.hostId}/trusted-devices`,
    )
    trustedDevices = data.devices || []
    return trustedDevices
  } catch {
    return []
  }
}

/**
 * Remove a device from the trusted devices list.
 */
export async function removeTrustedDevice(deviceId: string): Promise<void> {
  if (!currentRegistration) return

  await apiFetch(
    `/api/remote-play/hosts/${currentRegistration.hostId}/trusted-devices/${deviceId}`,
    { method: 'DELETE' },
  )
  trustedDevices = trustedDevices.filter((d) => d.deviceId !== deviceId)
}

/**
 * Register a callback for incoming connection requests.
 */
export function setOnConnectionRequestCallback(
  cb: ((request: ConnectionRequest) => void) | null,
): void {
  onConnectionRequestCallback = cb
}

/**
 * Get current registration status.
 */
export function getRegistration(): HostRegistration | null {
  return currentRegistration ? { ...currentRegistration } : null
}

// ── Cleanup ───────────────────────────────────────────────────────────────

export function cleanup(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
  currentRegistration = null
  pendingRequests = []
  trustedDevices = []
  onConnectionRequestCallback = null
}

// ── Service Object ─────────────────────────────────────────────────────────

export const presenceService = {
  async registerHost(name: string, username?: string) { return registerHost(name, username) },
  async sendHeartbeat() { return sendHeartbeat() },
  async unregisterHost() { return unregisterHost() },
  async getPendingRequests() { return getPendingRequests() },
  async respondToRequest(requestId: string, accept: boolean, rememberDevice?: boolean) { return respondToRequest(requestId, accept, rememberDevice) },
  async getTrustedDevices() { return getTrustedDevices() },
  async removeTrustedDevice(deviceId: string) { return removeTrustedDevice(deviceId) },
  setOnConnectionRequestCallback(cb: ((request: ConnectionRequest) => void) | null) { setOnConnectionRequestCallback(cb) },
  getRegistration() { return getRegistration() },
  cleanup() { cleanup() },
}

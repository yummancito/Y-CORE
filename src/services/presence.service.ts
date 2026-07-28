// ============================================================================
// src/services/presence.service.ts
// ----------------------------------------------------------------------------
// Frontend PresenceService — wraps Gateway calls for Remote Play presence.
// ============================================================================

import { BaseService, subscribeToEvent } from './gateway'
import type {
  HostRegistration,
  ConnectionRequest,
  DeviceInfo,
  WsSignalPayload,
} from '../../electron/common/ipc-contract'

class PresenceService extends BaseService {
  protected serviceName = 'remotePlay' as const

  async registerHost(name: string): Promise<HostRegistration> {
    return this.call('registerHost', name)
  }

  async unregisterHost(): Promise<void> {
    return this.call('unregisterHost')
  }

  async sendHeartbeat(): Promise<void> {
    return this.call('sendHeartbeat')
  }

  async getPendingRequests(): Promise<ConnectionRequest[]> {
    return this.call('getPendingRequests')
  }

  async respondToRequest(requestId: string, accept: boolean, rememberDevice?: boolean): Promise<void> {
    return this.call('respondToRequest', requestId, accept, rememberDevice)
  }

  async getTrustedDevices(): Promise<DeviceInfo[]> {
    return this.call('getTrustedDevices')
  }

  async removeTrustedDevice(deviceId: string): Promise<void> {
    return this.call('removeTrustedDevice', deviceId)
  }

  // ── WebSocket Signaling ──

  async connectWsSignaling(token: string): Promise<void> {
    return this.call('connectWsSignaling', token)
  }

  async disconnectWsSignaling(): Promise<void> {
    return this.call('disconnectWsSignaling')
  }

  async sendWsSignal(signal: WsSignalPayload): Promise<void> {
    return this.call('sendWsSignal', signal)
  }

  /** Subscribe to incoming signaling messages via WebSocket */
  onWsSignal(handler: (signal: WsSignalPayload) => void): () => void {
    return subscribeToEvent('remotePlay:wsSignal', handler)
  }

  /** Subscribe to incoming connection requests */
  onConnectionRequest(handler: (request: ConnectionRequest) => void): () => void {
    return subscribeToEvent('remotePlay:connectionRequest', handler)
  }
}

export const presenceService = new PresenceService()

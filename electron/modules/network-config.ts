// ============================================================================
// electron/modules/network-config.ts
// ============================================================================
// Network Configuration module for Online Fix
// Handles UPnP port mapping, ICE configuration, relay servers, and NAT detection
// ============================================================================

import os from 'os'
import { execSync } from 'child_process'
import { logger } from '../logger'

// ============================================================================
// Types and Interfaces
// ============================================================================

export type NATType = 'open' | 'moderate' | 'strict' | 'unknown'
export type FirewallStatus = 'enabled' | 'disabled' | 'unknown'

export interface NetworkAdapter {
  name: string
  address: string // IPv4 address
  family: string
  internal: boolean
  mac: string
}

export interface STUNServer {
  hostname: string
  port: number
  protocol: 'udp' | 'tcp'
  region?: string
  priority: number // Lower = higher priority
}

export interface TURNServer {
  hostname: string
  port: number
  protocol: 'udp' | 'tcp'
  username?: string
  password?: string
  realm?: string
  region?: string
  priority: number
}

export interface RelayServer {
  hostname: string
  port: number
  protocol: 'tcp' | 'udp'
  type: 'relay' | 'turn' | 'stun'
  region?: string
  latency?: number // ms
  available: boolean
  priority: number
}

export interface ICEConfiguration {
  stunServers: STUNServer[]
  turnServers: TURNServer[]
  iceTransportPolicy: 'all' | 'relay' | 'no_host' | 'host_only'
}

export interface UPnPConfig {
  enabled: boolean
  discoveryTimeout: number // ms
  portMappingTTL: number // seconds
  externalPortStart: number
  externalPortEnd: number
}

export interface NetworkDetectionResult {
  publicIp: string | null
  natType: NATType
  natDetectionMethod: string
  firewallEnabled: FirewallStatus
  networkAdapters: NetworkAdapter[]
  canUseUPnP: boolean
  upnpDeviceFound: boolean
  ipv6Available: boolean
  dnsResolvable: boolean
  recommendedTraversalMethod: 'upnp' | 'relay' | 'hole_punch' | 'none'
}

export interface NetworkConfiguration {
  publicIp: string | null
  localPort: number
  natType: NATType
  firewallStatus: FirewallStatus
  upnpConfig: UPnPConfig
  iceConfig: ICEConfiguration
  relayServers: RelayServer[]
  networkAdapters: NetworkAdapter[]
  detectionTimestamp: number
}

// ============================================================================
// Constants
// ============================================================================

// Public STUN servers (free tier)
const PUBLIC_STUN_SERVERS: STUNServer[] = [
  { hostname: 'stun.l.google.com', port: 19302, protocol: 'udp', region: 'global', priority: 1 },
  { hostname: 'stun1.l.google.com', port: 19302, protocol: 'udp', region: 'global', priority: 2 },
  { hostname: 'stun2.l.google.com', port: 19302, protocol: 'udp', region: 'global', priority: 3 },
  { hostname: 'stun.stunprotocol.org', port: 3478, protocol: 'udp', region: 'global', priority: 4 },
  { hostname: 'stun.miwifi.com', port: 3478, protocol: 'udp', region: 'china', priority: 5 },
]

// Public TURN servers (some free tier available)
const PUBLIC_TURN_SERVERS: TURNServer[] = [
  { hostname: 'turn.example.com', port: 3478, protocol: 'udp', region: 'us-east', priority: 1 },
  { hostname: 'turn.example.com', port: 5349, protocol: 'tcp', region: 'us-east', priority: 2 },
]

// Relay server options (can be customized per game/region)
const DEFAULT_RELAY_SERVERS: RelayServer[] = [
  { hostname: 'relay-us1.example.com', port: 9999, protocol: 'tcp', type: 'relay', region: 'us-east', available: true, priority: 1 },
  { hostname: 'relay-us2.example.com', port: 9999, protocol: 'tcp', type: 'relay', region: 'us-west', available: true, priority: 2 },
  { hostname: 'relay-eu1.example.com', port: 9999, protocol: 'tcp', type: 'relay', region: 'eu', available: true, priority: 3 },
]

// ============================================================================
// Network Adapter Detection
// ============================================================================

/**
 * Get all available network adapters (IPv4)
 */
export function getNetworkAdapters(): NetworkAdapter[] {
  const adapters: NetworkAdapter[] = []

  try {
    const interfaces = os.networkInterfaces()

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue

      for (const addr of addrs) {
        // Only include IPv4 addresses, skip loopback and internal
        if (addr.family === 'IPv4' && !addr.internal && addr.address) {
          adapters.push({
            name,
            address: addr.address,
            family: addr.family,
            internal: addr.internal,
            mac: addr.mac || 'unknown',
          })
        }
      }
    }
  } catch (err: any) {
    logger.warn(`Failed to enumerate network adapters: ${err.message}`, 'network-config')
  }

  logger.debug(`Found ${adapters.length} network adapters`, 'network-config')
  return adapters
}

/**
 * Get the primary network adapter's IPv4 address
 */
export function getPrimaryNetworkAddress(): string | null {
  const adapters = getNetworkAdapters()
  if (adapters.length === 0) return null

  // Prefer non-vEthernet adapters
  let primary = adapters.find((a) => !a.name.toLowerCase().includes('vethernet'))
  if (!primary) primary = adapters[0]

  return primary?.address || null
}

// ============================================================================
// Public IP Detection
// ============================================================================

/**
 * Detect public IP address using external service
 */
export async function detectPublicIP(): Promise<string | null> {
  const services = [
    'https://api.ipify.org?format=json',
    'https://checkip.amazonaws.com',
    'https://icanhazip.com',
  ]

  for (const service of services) {
    try {
      logger.debug(`Attempting to detect public IP from ${service}`, 'network-config')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch(service, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (!response.ok) continue

        const data = await response.text()
        const ip = data.trim().split('\n')[0]

        if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
          logger.info(`Detected public IP: ${ip}`, 'network-config')
          return ip
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId)
        throw fetchErr
      }
    } catch (err: any) {
      logger.debug(`Public IP detection from ${service} failed: ${err.message}`, 'network-config')
    }
  }

  logger.warn('Failed to detect public IP from any service', 'network-config')
  return null
}

// ============================================================================
// NAT Type Detection
// ============================================================================

/**
 * Detect NAT type using STUN protocol (simplified)
 * Full STUN detection is complex; this provides basic classification
 */
export async function detectNATType(): Promise<NATType> {
  try {
    if (process.platform === 'win32') {
      // Windows: try to get NAT info from registry/WMI
      try {
        const result = execSync('powershell -Command "Get-NetFirewallProfile | Select-Object -ExpandProperty Name"', {
          encoding: 'utf-8',
          timeout: 5000,
        })
        logger.debug(`Firewall info: ${result.substring(0, 100)}`, 'network-config')
      } catch (err) {
        // Ignore if PowerShell not available
      }
    }

    // Simplified detection: assume moderate if private IP + no UPnP
    const primaryAddr = getPrimaryNetworkAddress()
    if (!primaryAddr) return 'unknown'

    if (primaryAddr.startsWith('10.') || primaryAddr.startsWith('172.') || primaryAddr.startsWith('192.168.')) {
      // Private IP - likely behind NAT
      // Check if UPnP is available to determine strictness
      const hasUPnP = await checkUPnPAvailability()
      return hasUPnP ? 'moderate' : 'strict'
    }

    return 'open'
  } catch (err: any) {
    logger.warn(`NAT detection failed: ${err.message}`, 'network-config')
    return 'unknown'
  }
}

// ============================================================================
// UPnP Detection
// ============================================================================

/**
 * Check if UPnP is available on the network
 */
export async function checkUPnPAvailability(): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // Try to detect UPnP device using PowerShell
      try {
        execSync('powershell -Command "Get-WmiObject -Class Win32_PnPDevice | Where-Object {$_.Name -like \\"*UPnP*\\"} | Select-Object -First 1"', {
          timeout: 5000,
        })
        logger.info('UPnP device detected', 'network-config')
        return true
      } catch (err) {
        // Device not found or command failed
      }
    }

    // For non-Windows or as fallback, we can't easily detect UPnP without external library
    // Return false to be safe
    logger.debug('UPnP availability check inconclusive', 'network-config')
    return false
  } catch (err: any) {
    logger.warn(`UPnP availability check failed: ${err.message}`, 'network-config')
    return false
  }
}

// ============================================================================
// Firewall Detection
// ============================================================================

/**
 * Detect if Windows Firewall is enabled
 */
export function detectFirewallStatus(): FirewallStatus {
  try {
    if (process.platform === 'win32') {
      try {
        const result = execSync('powershell -Command "Get-NetFirewallProfile -Profile Domain, Public, Private | Select-Object -ExpandProperty Enabled | Select-Object -First 1"', {
          encoding: 'utf-8',
          timeout: 5000,
        })

        const isEnabled = result.toLowerCase().includes('true')
        logger.debug(`Firewall status detected: ${isEnabled ? 'enabled' : 'disabled'}`, 'network-config')
        return isEnabled ? 'enabled' : 'disabled'
      } catch (err) {
        logger.debug('Could not detect firewall status via PowerShell', 'network-config')
      }
    }

    return 'unknown'
  } catch (err: any) {
    logger.warn(`Firewall detection failed: ${err.message}`, 'network-config')
    return 'unknown'
  }
}

// ============================================================================
// ICE Configuration
// ============================================================================

/**
 * Build ICE configuration based on NAT type
 */
export async function buildICEConfiguration(natType: NATType = 'unknown'): Promise<ICEConfiguration> {
  const stunServers = PUBLIC_STUN_SERVERS.slice(0, 3)
  const turnServers = PUBLIC_TURN_SERVERS.slice(0, 2)

  let iceTransportPolicy: 'all' | 'relay' | 'no_host' | 'host_only' = 'all'

  switch (natType) {
    case 'open':
      iceTransportPolicy = 'all'
      break
    case 'moderate':
      iceTransportPolicy = 'all' // Try host first, relay as fallback
      break
    case 'strict':
      iceTransportPolicy = 'relay' // Force relay only
      break
    default:
      iceTransportPolicy = 'all'
  }

  logger.info(`Built ICE configuration for NAT type: ${natType} (policy: ${iceTransportPolicy})`, 'network-config')

  return {
    stunServers,
    turnServers,
    iceTransportPolicy,
  }
}

// ============================================================================
// Relay Server Management
// ============================================================================

/**
 * Get relay servers sorted by priority and latency
 */
export function getRelayServers(region?: string): RelayServer[] {
  const servers = [...DEFAULT_RELAY_SERVERS]

  // Filter by region if specified
  if (region) {
    return servers
      .filter((s) => !s.region || s.region === region)
      .sort((a, b) => {
        // Sort by availability first, then priority, then latency
        if (a.available !== b.available) return a.available ? -1 : 1
        if (a.priority !== b.priority) return a.priority - b.priority
        if (a.latency && b.latency) return a.latency - b.latency
        return 0
      })
  }

  return servers.sort((a, b) => a.priority - b.priority)
}

/**
 * Check if relay server is reachable
 */
export async function checkRelayServerLatency(server: RelayServer, timeoutMs: number = 3000): Promise<number | null> {
  try {
    const startTime = Date.now()
    logger.debug(`Checking relay server latency: ${server.hostname}:${server.port}`, 'network-config')

    // Attempt a simple TCP connection (or UDP ping for UDP servers)
    // This is a simplified check; real implementation would use proper protocol
    const response = await fetch(`http://${server.hostname}:${server.port}/ping`, {
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (response.ok) {
      const latency = Date.now() - startTime
      logger.debug(`Relay server latency: ${latency}ms`, 'network-config')
      return latency
    }

    return null
  } catch (err: any) {
    logger.debug(`Relay server check failed: ${err.message}`, 'network-config')
    return null
  }
}

// ============================================================================
// Network Detection
// ============================================================================

/**
 * Perform full network detection and return configuration
 */
export async function performNetworkDetection(): Promise<NetworkDetectionResult> {
  logger.info('Starting network detection', 'network-config')

  const adapters = getNetworkAdapters()
  const publicIp = await detectPublicIP()
  const natType = await detectNATType()
  const firewallEnabled = detectFirewallStatus()
  const canUseUPnP = await checkUPnPAvailability()

  // Determine recommended traversal method
  let recommendedTraversalMethod: 'upnp' | 'relay' | 'hole_punch' | 'none' = 'none'

  if (natType === 'open') {
    recommendedTraversalMethod = 'hole_punch'
  } else if (canUseUPnP) {
    recommendedTraversalMethod = 'upnp'
  } else if (natType === 'strict') {
    recommendedTraversalMethod = 'relay'
  }

  const result: NetworkDetectionResult = {
    publicIp,
    natType,
    natDetectionMethod: 'simplified-stun',
    firewallEnabled,
    networkAdapters: adapters,
    canUseUPnP,
    upnpDeviceFound: canUseUPnP,
    ipv6Available: false, // TODO: Implement IPv6 detection
    dnsResolvable: !!publicIp,
    recommendedTraversalMethod,
  }

  logger.info(
    `Network detection complete: NAT=${natType}, UPnP=${canUseUPnP}, PublicIP=${publicIp ? 'found' : 'not found'}`,
    'network-config'
  )

  return result
}

/**
 * Build complete network configuration
 */
export async function buildNetworkConfiguration(localPort: number = 0): Promise<NetworkConfiguration> {
  const detection = await performNetworkDetection()
  const iceConfig = await buildICEConfiguration(detection.natType)

  return {
    publicIp: detection.publicIp,
    localPort,
    natType: detection.natType,
    firewallStatus: detection.firewallEnabled,
    upnpConfig: {
      enabled: detection.canUseUPnP,
      discoveryTimeout: 3000,
      portMappingTTL: 3600,
      externalPortStart: 10000,
      externalPortEnd: 20000,
    },
    iceConfig,
    relayServers: getRelayServers(),
    networkAdapters: detection.networkAdapters,
    detectionTimestamp: Date.now(),
  }
}

/**
 * Export network configuration to JSON
 */
export function exportNetworkConfigToJSON(config: NetworkConfiguration): string {
  return JSON.stringify(config, null, 2)
}

/**
 * Export network configuration to environment variables format
 */
export function exportNetworkConfigToEnv(config: NetworkConfiguration): string {
  const lines: string[] = []

  lines.push(`PUBLIC_IP=${config.publicIp || 'unknown'}`)
  lines.push(`LOCAL_PORT=${config.localPort}`)
  lines.push(`NAT_TYPE=${config.natType}`)
  lines.push(`FIREWALL_STATUS=${config.firewallStatus}`)
  lines.push(`UPNP_ENABLED=${config.upnpConfig.enabled}`)

  lines.push(`ICE_TRANSPORT_POLICY=${config.iceConfig.iceTransportPolicy}`)

  lines.push(
    `STUN_SERVERS=${config.iceConfig.stunServers.map((s) => `${s.hostname}:${s.port}`).join(',')}`
  )

  lines.push(
    `RELAY_SERVERS=${config.relayServers.map((s) => `${s.hostname}:${s.port}`).join(',')}`
  )

  return lines.join('\n')
}

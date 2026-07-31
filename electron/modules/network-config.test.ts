// ============================================================================
// electron/modules/network-config.test.ts
// ============================================================================
// Tests for Network Configuration module
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getNetworkAdapters,
  getPrimaryNetworkAddress,
  detectNATType,
  detectFirewallStatus,
  checkUPnPAvailability,
  buildICEConfiguration,
  getRelayServers,
  buildNetworkConfiguration,
  exportNetworkConfigToJSON,
  exportNetworkConfigToEnv,
  type NATType,
  type FirewallStatus,
} from './network-config'

// ============================================================================
// Network Adapter Tests
// ============================================================================

describe('Network Adapter Detection', () => {
  it('should return array of network adapters', () => {
    const adapters = getNetworkAdapters()

    expect(Array.isArray(adapters)).toBe(true)
    if (adapters.length > 0) {
      expect(adapters[0]).toHaveProperty('name')
      expect(adapters[0]).toHaveProperty('address')
      expect(adapters[0]).toHaveProperty('family')
    }
  })

  it('should have valid IPv4 addresses', () => {
    const adapters = getNetworkAdapters()

    for (const adapter of adapters) {
      // Check if address matches IPv4 pattern
      const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
      expect(adapter.address).toMatch(ipv4Pattern)
    }
  })

  it('should return primary network address', () => {
    const primaryAddress = getPrimaryNetworkAddress()

    if (primaryAddress) {
      const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
      expect(primaryAddress).toMatch(ipv4Pattern)
    }
  })

  it('should skip loopback addresses', () => {
    const adapters = getNetworkAdapters()

    for (const adapter of adapters) {
      expect(adapter.address).not.toBe('127.0.0.1')
    }
  })
})

// ============================================================================
// NAT Detection Tests
// ============================================================================

describe('NAT Type Detection', () => {
  it('should detect valid NAT type', async () => {
    const natType = await detectNATType()

    expect(['open', 'moderate', 'strict', 'unknown']).toContain(natType)
  })

  it('should return string NAT type', async () => {
    const natType = await detectNATType()

    expect(typeof natType).toBe('string')
  })

  it('should handle multiple detection calls', async () => {
    const nat1 = await detectNATType()
    const nat2 = await detectNATType()

    expect(nat1).toBeDefined()
    expect(nat2).toBeDefined()
  })
})

// ============================================================================
// Firewall Detection Tests
// ============================================================================

describe('Firewall Status Detection', () => {
  it('should return valid firewall status', () => {
    const status = detectFirewallStatus()

    expect(['enabled', 'disabled', 'unknown']).toContain(status)
  })

  it('should return string status', () => {
    const status = detectFirewallStatus()

    expect(typeof status).toBe('string')
  })

  it('should not throw on repeated calls', () => {
    expect(() => {
      detectFirewallStatus()
      detectFirewallStatus()
    }).not.toThrow()
  })
})

// ============================================================================
// UPnP Detection Tests
// ============================================================================

describe('UPnP Availability Check', () => {
  it('should return boolean UPnP availability', async () => {
    const available = await checkUPnPAvailability()

    expect(typeof available).toBe('boolean')
  })

  it('should handle multiple UPnP checks', async () => {
    const check1 = await checkUPnPAvailability()
    const check2 = await checkUPnPAvailability()

    expect(typeof check1).toBe('boolean')
    expect(typeof check2).toBe('boolean')
  })
})

// ============================================================================
// ICE Configuration Tests
// ============================================================================

describe('ICE Configuration Building', () => {
  it('should build ICE config for open NAT', async () => {
    const config = await buildICEConfiguration('open')

    expect(config.stunServers.length).toBeGreaterThan(0)
    expect(config.turnServers.length).toBeGreaterThan(0)
    expect(config.iceTransportPolicy).toBeDefined()
  })

  it('should build ICE config for moderate NAT', async () => {
    const config = await buildICEConfiguration('moderate')

    expect(config.stunServers.length).toBeGreaterThan(0)
    expect(config.iceTransportPolicy).toBe('all')
  })

  it('should build ICE config for strict NAT', async () => {
    const config = await buildICEConfiguration('strict')

    expect(config.iceTransportPolicy).toBe('relay')
  })

  it('should have valid STUN servers', async () => {
    const config = await buildICEConfiguration()

    for (const server of config.stunServers) {
      expect(server.hostname).toBeDefined()
      expect(server.port).toBeGreaterThan(0)
      expect(['tcp', 'udp']).toContain(server.protocol)
    }
  })

  it('should have valid TURN servers', async () => {
    const config = await buildICEConfiguration()

    for (const server of config.turnServers) {
      expect(server.hostname).toBeDefined()
      expect(server.port).toBeGreaterThan(0)
    }
  })
})

// ============================================================================
// Relay Server Tests
// ============================================================================

describe('Relay Server Management', () => {
  it('should return relay servers', () => {
    const servers = getRelayServers()

    expect(Array.isArray(servers)).toBe(true)
    if (servers.length > 0) {
      expect(servers[0]).toHaveProperty('hostname')
      expect(servers[0]).toHaveProperty('port')
      expect(servers[0]).toHaveProperty('type')
    }
  })

  it('should sort relay servers by priority', () => {
    const servers = getRelayServers()

    for (let i = 1; i < servers.length; i++) {
      const prevPriority = servers[i - 1].priority
      const currPriority = servers[i].priority
      expect(prevPriority).toBeLessThanOrEqual(currPriority)
    }
  })

  it('should filter by region if specified', () => {
    const usServers = getRelayServers('us-east')

    for (const server of usServers) {
      if (server.region) {
        expect(server.region).toBe('us-east')
      }
    }
  })

  it('should have valid relay server configuration', () => {
    const servers = getRelayServers()

    for (const server of servers) {
      expect(server.hostname).toBeTruthy()
      expect(server.port).toBeGreaterThan(0)
      expect(['relay', 'turn', 'stun']).toContain(server.type)
      expect(['tcp', 'udp']).toContain(server.protocol)
    }
  })
})

// ============================================================================
// Network Configuration Tests
// ============================================================================

describe('Full Network Configuration', () => {
  it('should build complete network configuration', async () => {
    const config = await buildNetworkConfiguration(9999)

    expect(config).toHaveProperty('natType')
    expect(config).toHaveProperty('upnpConfig')
    expect(config).toHaveProperty('iceConfig')
    expect(config).toHaveProperty('relayServers')
    expect(config.localPort).toBe(9999)
  })

  it('should have valid NAT type in configuration', async () => {
    const config = await buildNetworkConfiguration()

    expect(['open', 'moderate', 'strict', 'unknown']).toContain(config.natType)
  })

  it('should include network adapters', async () => {
    const config = await buildNetworkConfiguration()

    expect(Array.isArray(config.networkAdapters)).toBe(true)
  })

  it('should set detection timestamp', async () => {
    const config = await buildNetworkConfiguration()

    expect(config.detectionTimestamp).toBeGreaterThan(0)
    expect(Date.now() - config.detectionTimestamp).toBeLessThan(5000)
  })
})

// ============================================================================
// Export Format Tests
// ============================================================================

describe('Network Configuration Export', () => {
  it('should export configuration to JSON', async () => {
    const config = await buildNetworkConfiguration(8888)
    const json = exportNetworkConfigToJSON(config)

    expect(typeof json).toBe('string')
    expect(() => JSON.parse(json)).not.toThrow()

    const parsed = JSON.parse(json)
    expect(parsed.localPort).toBe(8888)
  })

  it('should export configuration to environment variables', async () => {
    const config = await buildNetworkConfiguration(7777)
    const env = exportNetworkConfigToEnv(config)

    expect(typeof env).toBe('string')
    expect(env).toContain('LOCAL_PORT=7777')
    expect(env).toContain('NAT_TYPE=')
  })

  it('should include required fields in env export', async () => {
    const config = await buildNetworkConfiguration()
    const env = exportNetworkConfigToEnv(config)

    expect(env).toContain('PUBLIC_IP=')
    expect(env).toContain('NAT_TYPE=')
    expect(env).toContain('FIREWALL_STATUS=')
    expect(env).toContain('UPNP_ENABLED=')
    expect(env).toContain('ICE_TRANSPORT_POLICY=')
  })

  it('should include server lists in env export', async () => {
    const config = await buildNetworkConfiguration()
    const env = exportNetworkConfigToEnv(config)

    expect(env).toContain('STUN_SERVERS=')
    expect(env).toContain('RELAY_SERVERS=')
  })
})

// ============================================================================
// Configuration Validity Tests
// ============================================================================

describe('Network Configuration Validity', () => {
  it('should have valid UPnP configuration', async () => {
    const config = await buildNetworkConfiguration()

    expect(typeof config.upnpConfig.enabled).toBe('boolean')
    expect(config.upnpConfig.discoveryTimeout).toBeGreaterThan(0)
    expect(config.upnpConfig.portMappingTTL).toBeGreaterThan(0)
    expect(config.upnpConfig.externalPortStart).toBeGreaterThan(0)
    expect(config.upnpConfig.externalPortEnd).toBeGreaterThan(config.upnpConfig.externalPortStart)
  })

  it('should have valid ICE configuration', async () => {
    const config = await buildNetworkConfiguration()

    expect(config.iceConfig.stunServers.length).toBeGreaterThan(0)
    expect(['all', 'relay', 'no_host', 'host_only']).toContain(config.iceConfig.iceTransportPolicy)
  })

  it('should handle zero local port', async () => {
    const config = await buildNetworkConfiguration(0)

    expect(config.localPort).toBe(0)
  })

  it('should handle high port numbers', async () => {
    const config = await buildNetworkConfiguration(65535)

    expect(config.localPort).toBe(65535)
  })
})

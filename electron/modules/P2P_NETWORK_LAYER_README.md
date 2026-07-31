# P2P Network and Online Fix Layer - Complete Implementation

## Overview

This document describes the complete implementation of the P2P network and online fix layer for Y-Core. The system provides comprehensive P2P protocol detection, network configuration, connection management, and LAN fallback capabilities.

## Components

### 1. P2P Protocol Detector (`p2p-detector.ts`)

**Purpose:** Analyze game binaries and configurations to detect P2P protocol types.

**Features:**
- Detects Steam P2P API calls, GameSpy references, custom P2P implementations
- Scans binary files for protocol signatures
- Analyzes configuration files for networking keywords
- Parses Steam app manifests for P2P-related flags
- Implements 30-day result caching with TTL

**Key Functions:**
```typescript
detectP2PProtocol(gameDir: string, appId: string): Promise<P2PDetectionResult>
clearP2PDetectionCache(appId?: string): void
getP2PDetectionFromCache(appId: string): P2PDetectionResult | null
```

**Protocol Types Detected:**
- `steam_p2p`: Steam P2P API
- `gamespy`: GameSpy protocol
- `custom_p2p`: Custom P2P implementations
- `none`: No P2P networking detected
- `unknown`: Unable to determine

**Detection Signals:**
- Steam P2P Signatures: `ISteamP2P`, `SendP2PPacket`, `SteamNetworking`, etc.
- GameSpy Signatures: `GameSpy`, `gstats`, `oneauth`, etc.
- Relay Indicators: `STUN`, `TURN`, `ICE`, `relay`
- Hole Punch Indicators: `UPnP`, `NAT`, `port_mapping`

### 2. Network Configuration (`network-config.ts`)

**Purpose:** Detect network state and configure appropriate P2P network settings.

**Features:**
- Enumerate network adapters (IPv4)
- Detect public IP address
- Classify NAT type (open, moderate, strict)
- Detect firewall status (Windows)
- Check UPnP availability
- Build ICE configuration with STUN/TURN servers
- Configure relay server lists
- Export configuration in JSON and environment variable formats

**Key Functions:**
```typescript
getNetworkAdapters(): NetworkAdapter[]
detectPublicIP(): Promise<string | null>
detectNATType(): Promise<NATType>
detectFirewallStatus(): FirewallStatus
checkUPnPAvailability(): Promise<boolean>
buildICEConfiguration(natType?: NATType): Promise<ICEConfiguration>
buildNetworkConfiguration(localPort?: number): Promise<NetworkConfiguration>
```

**Public STUN Servers (Pre-configured):**
- `stun.l.google.com:19302` (Google)
- `stun1.l.google.com:19302` (Google)
- `stun2.l.google.com:19302` (Google)
- `stun.stunprotocol.org:3478` (Community)
- `stun.miwifi.com:3478` (China)

**NAT Traversal Strategy Selection:**
```
NAT Type: Open
├─ Recommended: Direct connection (hole punch)
├─ Uses: Public IP + direct connectivity
└─ Fallback: Relay if direct fails

NAT Type: Moderate
├─ Recommended: Primary direct + relay fallback
├─ Uses: UPnP + hole punch
└─ Fallback: Relay server

NAT Type: Strict
├─ Recommended: Relay only
├─ Uses: TURN servers
└─ Fallback: None (requires relay)
```

### 3. Connection Management (`p2p-connection.ts`)

**Purpose:** Manage P2P connections with timeouts, keep-alives, and error recovery.

**Features:**
- Connection state machine (idle → connecting → connected → disconnecting → disconnected)
- Configurable connection timeouts
- Automatic keep-alive ping mechanism
- Connection pooling with max limit
- Connection metrics tracking
- Error recovery with exponential backoff
- Graceful connection cleanup

**Connection Pool:**
```typescript
class P2PConnectionPool {
  getConnection(peerId: string, peerAddress: PeerAddress): Promise<P2PConnection>
  closeConnection(peerId: string): Promise<void>
  closeAllConnections(): Promise<void>
  getStatistics(): PoolStatistics
  getConnectionMetrics(peerId?: string): ConnectionMetrics[]
}
```

**Metrics Tracked:**
- `bytesReceived`, `bytesSent`
- `packetsReceived`, `packetsSent`
- `averageLatency`, `latencyHistory` (last 50)
- `failureCount`, `successCount`
- Connection state and timestamps

**Default Timeouts:**
- Connection Timeout: 15 seconds
- Keep-Alive Interval: 30 seconds
- Keep-Alive Response Timeout: 10 seconds
- Max Retries: 3

**Backoff Strategies:**
- `exponential_backoff`: 2^n × 1000ms, max 32000ms
- `linear_backoff`: (n+1) × 1000ms, max 32000ms
- `immediate`: No delay
- `no_retry`: Only one attempt

### 4. LAN Fallback (`lan-fallback.ts`)

**Purpose:** Switch to LAN-only mode when internet is unavailable, with local peer discovery.

**Features:**
- Internet connectivity monitoring
- Mode switching (online → lan_only → offline)
- mDNS-style local service announcement and discovery
- Local relay server setup
- Automatic peer discovery on LAN
- Configurable monitoring intervals

**LAN Modes:**
```
ONLINE: Internet available, use standard networking
├─ Connection: Direct to peers via internet
├─ Protocol: Full P2P with relay options
└─ Relay: Available if needed

LAN_ONLY: Internet unavailable, use LAN
├─ Connection: Direct to LAN peers only
├─ Discovery: mDNS-based peer discovery
└─ Relay: Local relay server available

OFFLINE: No internet, no LAN
├─ Status: Completely disconnected
├─ Behavior: No networking operations
└─ Recovery: Wait for connectivity
```

**Key Functions:**
```typescript
checkInternetConnectivity(timeoutMs?: number): Promise<boolean>
announceLANService(peerId: string, port: number): Promise<boolean>
discoverLANServices(config?: Partial<LANFallbackConfig>): Promise<LANPeer[]>
class LocalRelayServer { /* ... */ }
class LANFallbackManager { /* ... */ }
```

**Local Relay Server Capabilities:**
- Register/unregister LAN peers
- Relay data between peers
- Track connection statistics
- Event emission for peer discovery

## Integration: `onlinefix-network-integration.ts`

This module integrates all P2P and network components for seamless online fix functionality.

### IPC Handlers

```typescript
// Initialize network configuration for a game
ipcMain.handle('onlinefix:network:initialize', (event, { appId, gameDir }) => {
  // Returns: { success, config }
})

// Export network configuration
ipcMain.handle('onlinefix:network:export', (event, { appId, gameDir, format }) => {
  // Returns: { success, data, format }
})

// Detect P2P protocol
ipcMain.handle('onlinefix:network:detect-protocol', (event, { appId, gameDir }) => {
  // Returns: { success, protocol, confidence, detectedAPICalls }
})

// Clear detection cache
ipcMain.handle('onlinefix:network:clear-cache', (event, { appId }) => {
  // Returns: { success }
})

// Get connection pool statistics
ipcMain.handle('onlinefix:network:pool-stats', (event, { appId }) => {
  // Returns: { success, stats }
})

// Get LAN fallback status
ipcMain.handle('onlinefix:network:lan-status', (event, { appId }) => {
  // Returns: { success, status }
})

// Initialize connection manager
ipcMain.handle('onlinefix:network:init-manager', (event, { appId, gameDir }) => {
  // Returns: { success, appId, message }
})

// Close connection manager
ipcMain.handle('onlinefix:network:close-manager', (event, { appId }) => {
  // Returns: { success, message }
})
```

## Configuration File Format

Enhanced `ycore_online.json` with P2P network configuration:

```json
{
  "enabled": true,
  "originalAppId": 480,
  "spoofAppId": 480,
  "steamId": 0,
  "language": "english",
  "generatedAt": "2026-07-30T00:00:00Z",
  "ycoreVersion": "3.0.1",
  
  "p2pProtocol": {
    "type": "steam_p2p",
    "requiresUPnP": true,
    "requiresRelay": false,
    "requiresSTUN": true,
    "requiresTURN": false,
    "natTraversalMethod": "upnp",
    "recommendedConnectionTimeout": 15000,
    "maxPeers": 32,
    "detectionConfidence": 95,
    "detectionMethod": ["steam_api_signatures", "relay_indicators"]
  },
  
  "networkConfiguration": {
    "publicIp": "203.0.113.42",
    "localPort": 9999,
    "natType": "moderate",
    "firewallStatus": "enabled",
    "upnpConfig": {
      "enabled": true,
      "discoveryTimeout": 3000,
      "portMappingTTL": 3600,
      "externalPortStart": 10000,
      "externalPortEnd": 20000
    },
    "iceConfig": {
      "iceTransportPolicy": "all",
      "stunServers": [
        { "hostname": "stun.l.google.com", "port": 19302, "protocol": "udp" }
      ],
      "turnServers": []
    },
    "relayServers": [
      {
        "hostname": "relay-us1.example.com",
        "port": 9999,
        "protocol": "tcp",
        "type": "relay",
        "region": "us-east",
        "available": true,
        "priority": 1
      }
    ],
    "networkAdapters": [
      {
        "name": "Ethernet",
        "address": "192.168.1.100",
        "family": "IPv4",
        "internal": false,
        "mac": "00:11:22:33:44:55"
      }
    ],
    "detectionTimestamp": 1722336000000
  },
  
  "localPort": 9999,
  "useRelay": false,
  "useLANFallback": true
}
```

## Error Messages for i18n

```typescript
// Network Detection Errors
"error.network.detection_failed": "Failed to detect network configuration",
"error.network.no_adapters": "No network adapters found",
"error.network.invalid_config": "Invalid network configuration",

// Connection Errors
"error.connection.timeout": "Connection timeout ({{timeout}}ms)",
"error.connection.refused": "Connection refused by peer",
"error.connection.closed": "Connection closed unexpectedly",
"error.connection.pool_full": "Connection pool at maximum capacity",

// P2P Protocol Errors
"error.p2p.unknown_protocol": "Unknown P2P protocol",
"error.p2p.detection_failed": "Failed to detect P2P protocol",
"error.p2p.no_binaries": "No game executable files found",

// LAN Fallback Errors
"error.lan.offline": "No internet and LAN unavailable",
"error.lan.discovery_failed": "LAN peer discovery failed",
"error.lan.relay_failed": "Local relay server unavailable",

// NAT/Firewall Errors
"error.nat.unknown_type": "Unable to determine NAT type",
"error.firewall.detection_failed": "Failed to detect firewall status",

// Relay Server Errors
"error.relay.unreachable": "Relay server unreachable",
"error.relay.timeout": "Relay server connection timeout",
"error.relay.max_peers": "Relay server at maximum peer capacity",

// UPnP Errors
"error.upnp.device_not_found": "UPnP device not found on network",
"error.upnp.port_mapping_failed": "Failed to map external port",
"error.upnp.nat_not_supported": "NAT does not support UPnP"
```

## Usage Examples

### Basic Initialization

```typescript
import { initializeGameNetworking, getConnectionManager } from './onlinefix-network-integration'

// Initialize network for a game
const config = await initializeGameNetworking(gameDir, '480')

// Create connection manager
const manager = await getOrCreateConnectionManager('480', gameDir, true)

// Get connection statistics
const stats = manager.pool.getStatistics()
console.log(`Active connections: ${stats.activeConnections}`)
```

### Network Configuration

```typescript
import { buildNetworkConfiguration } from './network-config'

// Build full network config
const netConfig = await buildNetworkConfiguration(9999)

// Export for game use
const jsonConfig = exportNetworkConfigToJSON(netConfig)
const envConfig = exportNetworkConfigToEnv(netConfig)
```

### P2P Detection

```typescript
import { detectP2PProtocol } from './p2p-detector'

// Detect protocol for game
const result = await detectP2PProtocol(gameDir, appId)

console.log(`Protocol: ${result.protocol.type}`)
console.log(`Confidence: ${result.protocol.detectionConfidence}%`)
console.log(`NAT Traversal: ${result.protocol.natTraversalMethod}`)
```

### LAN Fallback

```typescript
import { createLANFallbackManager } from './lan-fallback'

// Create and initialize LAN manager
const lanManager = createLANFallbackManager(peerId)
await lanManager.initialize()

// Start local relay in LAN-only mode
if (lanManager.getMode() === 'lan_only') {
  const relay = await lanManager.startLocalRelay()
}

// Discover LAN peers
const peers = await lanManager.discoverAndConnectToPeers()

// Clean up
await lanManager.shutdown()
```

## Testing

Comprehensive test suites are provided for all modules:

- `p2p-detector.test.ts`: Protocol detection and caching
- `network-config.test.ts`: Network configuration and detection
- `p2p-connection.test.ts`: Connection management and pooling
- `lan-fallback.test.ts`: LAN fallback and peer discovery

**Test Coverage Target:** 70%+

**Run Tests:**
```bash
npm run test -- p2p-detector.test.ts
npm run test -- network-config.test.ts
npm run test -- p2p-connection.test.ts
npm run test -- lan-fallback.test.ts
```

## Performance Considerations

### Caching
- P2P detection results cached for 30 days
- Network configuration cached in `ycore_online.json`
- Connection metrics maintained in memory (configurable pool size)

### Timeouts
- Connection timeout: 15 seconds (configurable per protocol)
- Keep-alive interval: 30 seconds
- Keep-alive response timeout: 10 seconds
- Internet connectivity check: 5 seconds per server

### Resource Usage
- Connection pool: Default max 32 connections per game
- Latency history: Last 50 measurements per connection
- Cache directory: `.p2p-cache/` in module directory

## Known Limitations

1. **Relay Servers:** Current implementation uses placeholder relay servers; production requires actual relay infrastructure
2. **STUN/TURN:** Uses public free servers; production should use dedicated infrastructure
3. **mDNS:** Simplified local discovery; production should use proper mDNS library
4. **UDP Support:** Focus is on TCP; UDP support can be added in future
5. **IPv6:** Not currently supported; can be added as extension

## Future Enhancements

1. Integrate real UPnP library (natpmp, miniupnp)
2. Add dedicated TURN server support
3. Implement proper mDNS using native modules
4. Add IPv6 support
5. WebRTC data channel support
6. Peer-to-peer message relay improvements
7. Advanced NAT detection using STUN protocol
8. Traffic shaping and QoS support

## Dependencies

- Node.js built-in: `os`, `net`, `path`, `fs`, `events`
- Electron: `ipcMain` for IPC handlers
- Logger: Custom logger module

## Integration with Online Fix

These network and P2P components extend the existing Online Fix functionality to provide:

1. **Protocol Detection:** Automatically detect what type of P2P networking the game uses
2. **Network Configuration:** Optimize network settings for the specific game
3. **Connection Management:** Handle peer connections reliably with retries and metrics
4. **LAN Support:** Continue playing games on LAN when internet is unavailable

The integration is transparent to existing Online Fix code and provides additional capabilities through new IPC handlers.

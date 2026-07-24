// ============================================================================
// tests/steampipe/cm-directory.test.ts
// ----------------------------------------------------------------------------
// Round-2 ship-gate test: build a synthetic CMsgGetSDRConfigResponse byte
// buffer per the EXACT proto schema Valve uses, feed it through
// parseSdrConfigResponse, and verify the returned CmListResponse. No network —
// pure wire-format contract test.
//
// Schema (per SteamDatabase/Protobufs / SteamKit2):
//   CMsgGetSDRConfigResponse {
//     uint32 cell_id = 1;
//     uint32 load_summary_code = 2;
//     repeated CMsgServer server_list = 3;     // length-delimited per item
//     string fallback_relay = 4;
//   }
//   CMsgServer {
//     uint32 type = 1;
//     uint32 sourceid = 2;
//     uint32 cell_id = 3;
//     string host = 4;
//     uint32 port = 5;
//     optional bool ws = 6;
//   }
//
// This test is the cheapest confidence boost after fixing the BLOCKER
// (cm-directory was sending JSON, must send proto). If this round-trips, the
// proto encoder + decoder are wired correctly.
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  encodeVarintField,
  encodeBytesField,
  encodeVarint,
} from '../../electron/modules/steampipe/proto'
import {
  parseSdrConfigResponse,
  getCmServerList,
  validateDirectoryOpts,
} from '../../electron/modules/steampipe/cm-directory'

/** Build a CMsgServer bytes buffer per the proto schema. */
function buildCmsgServer(server: {
  type: number
  sourceId: number
  cellId: number
  host: string
  port: number
  ws?: boolean
}): Buffer {
  const parts: Buffer[] = [
    encodeVarintField(1, server.type),
    encodeVarintField(2, server.sourceId),
    encodeVarintField(3, server.cellId),
    encodeBytesField(4, server.host),
    encodeVarintField(5, server.port),
  ]
  if (server.ws !== undefined) {
    parts.push(encodeVarintField(6, server.ws ? 1 : 0))
  }
  return Buffer.concat(parts)
}

/**
 * Build a CMsgGetSDRConfigResponse bytes buffer containing N servers in
 * server_list and optional fallback_relay.
 */
function buildSdrConfigResponse(opts: {
  cellId: number
  loadSummaryCode: number
  servers: Parameters<typeof buildCmsgServer>[0][]
  fallbackRelay?: string
}): Buffer {
  // server_list field 3: protobuf repeated encoding — for each server:
  //   [varint length of server body] [server body bytes]
  const serverFrames: Buffer[] = []
  for (const s of opts.servers) {
    const body = buildCmsgServer(s)
    serverFrames.push(encodeVarint(body.length))
    serverFrames.push(body)
  }
  const serverListBlob = Buffer.concat(serverFrames)

  const parts: Buffer[] = [
    encodeVarintField(1, opts.cellId),
    encodeVarintField(2, opts.loadSummaryCode),
    encodeBytesField(3, serverListBlob),
  ]
  if (opts.fallbackRelay !== undefined) {
    parts.push(encodeBytesField(4, opts.fallbackRelay))
  }
  return Buffer.concat(parts)
}

describe('cm-directory — proto-encoded response parsing', () => {
  it('parses a single-server response round-trip', () => {
    const bytes = buildSdrConfigResponse({
      cellId: 1,
      loadSummaryCode: 1,
      servers: [
        {
          type: 0,
          sourceId: 7,
          cellId: 1,
          host: 'cm1-ord.valve.net',
          port: 27017,
        },
      ],
    })
    const parsed = parseSdrConfigResponse(bytes)
    expect(parsed.cellId).toBe(1)
    expect(parsed.loadSummaryCode).toBe(1)
    expect(parsed.servers.length).toBe(1)
    expect(parsed.servers[0]).toEqual({
      host: 'cm1-ord.valve.net',
      port: 27017,
      type: 0,
      sourceId: 7,
      isWebSocket: false,
    })
    expect(parsed.fallbackRelay).toBeUndefined()
  })

  it('parses multiple servers with ws flag', () => {
    const bytes = buildSdrConfigResponse({
      cellId: 17,
      loadSummaryCode: 1,
      servers: [
        { type: 0, sourceId: 5, cellId: 17, host: 'cm-na-1.example', port: 27017, ws: false },
        { type: 0, sourceId: 6, cellId: 17, host: 'cm-na-2.example', port: 27018, ws: true },
        { type: 0, sourceId: 5, cellId: 17, host: 'cm-na-3.example', port: 27019, ws: true },
      ],
      fallbackRelay: 'relay-na.example',
    })
    const parsed = parseSdrConfigResponse(bytes)
    expect(parsed.servers.length).toBe(3)
    expect(parsed.servers[0].isWebSocket).toBe(false)
    expect(parsed.servers[1].isWebSocket).toBe(true)
    expect(parsed.servers[2].isWebSocket).toBe(true)
    expect(parsed.fallbackRelay).toBe('relay-na.example')
    expect(parsed.cellId).toBe(17)
    expect(parsed.loadSummaryCode).toBe(1)
  })

  it('returns empty array on response with no servers', () => {
    // cell_id + load_summary_code only, no server_list field
    const bytes = Buffer.concat([
      encodeVarintField(1, 0),
      encodeVarintField(2, 1),
    ])
    const parsed = parseSdrConfigResponse(bytes)
    expect(parsed.cellId).toBe(0)
    expect(parsed.loadSummaryCode).toBe(1)
    expect(parsed.servers.length).toBe(0)
  })

  it('handles zero-length server_list body gracefully', () => {
    const bytes = Buffer.concat([
      encodeVarintField(1, 0),
      encodeVarintField(2, 1),
      encodeBytesField(3, Buffer.alloc(0)),
    ])
    const parsed = parseSdrConfigResponse(bytes)
    expect(parsed.servers.length).toBe(0)
  })

  it('truncates partial malformed stream without crashing', () => {
    // Build a valid first server, then garbage that triggers the length-too-large
    // bail path. The parser should return at least the valid first server.
    const validServerBody = buildCmsgServer({
      type: 0,
      sourceId: 1,
      cellId: 1,
      host: 'good.example',
      port: 27017,
    })
    const goodFrame = Buffer.concat([encodeVarint(validServerBody.length), validServerBody])
    // Garbage frame: declare length 99999 but only have 5 bytes after.
    const garbageFrame = Buffer.concat([encodeVarint(99999), Buffer.from([0x08, 0x01, 0x10, 0x01, 0x01])])
    const malformed = Buffer.concat([encodeBytesField(3, Buffer.concat([goodFrame, garbageFrame]))])

    const parsed = parseSdrConfigResponse(malformed)
    // We should at least get the good first server parsed; the second hit a
    // length-too-large bail. Resilience property: at minimum one valid server
    // returned, no crash, no swallowed exception to caller.
    expect(parsed.servers.length).toBeGreaterThanOrEqual(1)
    expect(parsed.servers[0].host).toBe('good.example')
  })
})

/**
 * Exercise the canonical validateDirectoryOpts helper directly. This is
 * round-3's test-hygiene fix: previously the "boundary cellId=0" test
 * inlined the validation logic, which would drift silently if we later
 * tightened bounds. Now tests assert against the real exported helper.
 */
describe('cm-directory — input validation via helper (round-3 fix)', () => {
  it('accepts boundary cellId=0 with default maxServers', () => {
    const r = validateDirectoryOpts({})
    expect(r.cellId).toBe(0)
    expect(r.maxServers).toBe(30)
  })

  it('accepts a typical NA cellId + capped maxServers', () => {
    const r = validateDirectoryOpts({ cellId: 17, maxServers: 100 })
    expect(r.cellId).toBe(17)
    expect(r.maxServers).toBe(100)
  })

  it('rejects negative cellId', () => {
    expect(() => validateDirectoryOpts({ cellId: -1 })).toThrow(/cellId out of range/)
  })

  it('rejects NaN cellId', () => {
    expect(() => validateDirectoryOpts({ cellId: NaN })).toThrow(/cellId out of range/)
  })

  it('rejects fractional cellId', () => {
    expect(() => validateDirectoryOpts({ cellId: 1.5 })).toThrow(/cellId out of range/)
  })

  it('rejects out-of-range cellId (>0xffffffff)', () => {
    expect(() => validateDirectoryOpts({ cellId: 0x1_0000_0000 })).toThrow(/cellId out of range/)
  })

  it('rejects zero maxServers', () => {
    expect(() => validateDirectoryOpts({ maxServers: 0 })).toThrow(/maxServers out of range/)
  })

  it('rejects negative maxServers', () => {
    // Round-3 reviewer hygiene note: maxServers < 1 branch catches both 0
    // and negatives. Document the negative boundary explicitly here even
    // though it shares the rejection branch with the zero test above.
    expect(() => validateDirectoryOpts({ maxServers: -1 })).toThrow(/maxServers out of range/)
  })

  it('rejects massively large maxServers (>200)', () => {
    expect(() => validateDirectoryOpts({ maxServers: 9999 })).toThrow(/maxServers out of range/)
  })
})

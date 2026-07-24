// url-guard.ts — Defensa contra SSRF para URLs externas que el proceso main
// fetchea en nombre del renderer (proxy de subtítulos, etc.) antes de
// dispararles axios.get.

import { promises as dns } from 'dns'
import { isIP } from 'net'

function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    const [a, b] = parts
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 0) return true
    if (a >= 224) return true
    return false
  }
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1') return true
    if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local fc00::/7
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.split(':').pop() || ''
      return isIP(v4) === 4 ? isPrivateOrReservedIp(v4) : true
    }
    return false
  }
  return false
}

/**
 * Lanza si `rawUrl` no es http(s) público y seguro de fetchear server-side:
 * rechaza esquemas no-http(s) y hosts que resuelven a IP privada/loopback.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`URL inválida: ${rawUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Esquema no permitido: ${parsed.protocol}`)
  }

  const hostname = parsed.hostname
  if (!hostname) throw new Error('URL sin host')

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Host bloqueado (IP privada/reservada): ${hostname}`)
    }
    return
  }

  if (hostname === 'localhost') {
    throw new Error('Host bloqueado: localhost')
  }

  let addresses: string[]
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true })
    addresses = results.map((r) => r.address)
  } catch {
    throw new Error(`No se pudo resolver el host: ${hostname}`)
  }

  if (addresses.length === 0) {
    throw new Error(`Host sin registros DNS: ${hostname}`)
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr)) {
      throw new Error(`Host bloqueado (resuelve a IP privada/reservada): ${hostname} → ${addr}`)
    }
  }
}

/** Host exacto esperado (whitelist estricta, sin substring matching). */
export function assertKnownHost(rawUrl: string, allowedHosts: string[]): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`URL inválida: ${rawUrl}`)
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Host no permitido: ${parsed.hostname}`)
  }
}

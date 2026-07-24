// url-guard.ts — Defensa contra SSRF para URLs que llegan de fuentes no
// confiables (query params del cliente, HTML scrapeado de terceros) antes
// de que el servidor las navegue (Playwright) o las fetchee (axios).

import { promises as dns } from 'dns'
import { isIP } from 'net'

/** Rangos de red que nunca deben ser alcanzados desde un fetch server-side. */
function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    const [a, b] = parts
    if (a === 10) return true // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 127) return true // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local + metadata cloud)
    if (a === 0) return true // 0.0.0.0/8
    if (a >= 224) return true // multicast/reserved (224.0.0.0+)
    return false
  }
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1') return true // loopback
    if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local fc00::/7
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — revalidar la parte v4
      const v4 = lower.split(':').pop() || ''
      return isIP(v4) === 4 ? isPrivateOrReservedIp(v4) : true
    }
    return false
  }
  // No es una IP literal (hostname normal) — se valida vía DNS en assertPublicHttpUrl
  return false
}

/**
 * Lanza si `rawUrl` no es una URL http(s) pública y segura de fetchear
 * server-side: rechaza esquemas no-http(s) (file:, data:, etc.) y bloquea
 * hosts que resuelven a rangos privados/loopback/link-local (protección SSRF).
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
  if (!hostname) {
    throw new Error('URL sin host')
  }

  // Host literal en IP (bypass típico de whitelist por string)
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Host bloqueado (IP privada/reservada): ${hostname}`)
    }
    return
  }

  if (hostname === 'localhost') {
    throw new Error('Host bloqueado: localhost')
  }

  // Resolver DNS y bloquear si CUALQUIER IP resuelta es privada — evita el
  // bypass de "DNS rebinding" donde el hostname resuelve a una IP pública
  // en el momento de la validación pero a una privada en el del fetch real
  // no cubre ese caso (TOCTOU inherente a cualquier check por DNS), pero sí
  // bloquea el caso común de un hostname que apunta directo a red interna.
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

/** Valida que `url` pertenezca exactamente al origen esperado (whitelist estricta por dominio). */
export function assertKnownOrigin(url: string, allowedOrigin: string): void {
  let parsed: URL
  let allowed: URL
  try {
    parsed = new URL(url)
    allowed = new URL(allowedOrigin)
  } catch {
    throw new Error(`URL inválida: ${url}`)
  }
  if (parsed.protocol !== allowed.protocol || parsed.host !== allowed.host) {
    throw new Error(`Origen no permitido: esperado ${allowed.origin}, recibido ${parsed.origin}`)
  }
}

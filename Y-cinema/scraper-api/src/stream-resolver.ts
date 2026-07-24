// stream-resolver.ts — Extrae URLs .m3u8 de páginas de video embed.
// Flujo: detail page (Playwright) → iframe embed → resolver .m3u8
// El resolver usa axios + cheerio para el iframe (la mayoría de hosts de
// video NO tienen Cloudflare en sus páginas embed).

import axios from 'axios'
import * as cheerio from 'cheerio'
import { assertPublicHttpUrl } from './url-guard'

export interface StreamInfo {
  url: string
  type: 'hls' | 'mp4'
  quality: string
  headers?: Record<string, string>
  subtitles?: Array<{ url: string; lang: string }>
}

const TIMEOUT = 15000
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.google.com/',
}

/**
 * Resuelve una URL de stream desde una página embed.
 * Estrategias en orden:
 *   1. URL directa .m3u8/.mp4
 *   2. Parsear HTML → buscar en video/source/scripts/body
 *   3. Si hay iframe en el HTML y no se encontró stream → resolver el iframe
 */
export async function resolveStreamUrl(embedUrl: string, depth = 0): Promise<StreamInfo | null> {
  if (!embedUrl || depth > 1) return null

  // Bloquear SSRF antes de cualquier fetch: embedUrl viene de HTML scrapeado
  // de terceros (iframes de reproductor), un host arbitrario controlado por
  // el sitio scrapeado (o por quien lo comprometa) no debe poder hacer que
  // este servidor le pegue a red interna/loopback.
  try {
    await assertPublicHttpUrl(embedUrl)
  } catch (err) {
    console.warn(`[StreamResolver] embedUrl bloqueada: ${(err as Error).message}`)
    return null
  }

  // Caso 1: URL directa a .m3u8 o .mp4
  if (embedUrl.includes('.m3u8')) {
    return { url: embedUrl, type: 'hls', quality: 'HD' }
  }
  if (embedUrl.includes('.mp4')) {
    return { url: embedUrl, type: 'mp4', quality: 'HD' }
  }

  // Caso 2: descargar HTML y analizar
  let html: string
  try {
    const { data } = await axios.get(embedUrl, {
      timeout: TIMEOUT,
      headers: { ...HEADERS, Referer: embedUrl },
      responseType: 'text',
    })
    html = data
  } catch (err) {
    console.warn(`[StreamResolver] Error al descargar embed: ${(err as Error).message}`)
    return null
  }

  const $ = cheerio.load(html)
  const referer = embedUrl

  const stream = tryExtractStream($, referer)
  if (stream) {
    // El stream final (incl. los extraídos por regex de <script>/body, que no
    // pasan por makeAbsolute) también se valida — puede apuntar a cualquier
    // host que el HTML scrapeado haya inyectado.
    try {
      await assertPublicHttpUrl(stream.url)
    } catch (err) {
      console.warn(`[StreamResolver] stream final bloqueado: ${(err as Error).message}`)
      return null
    }
    return stream
  }

  // Caso 3: buscar iframe anidado y resolverlo recursivamente
  const iframeSrc = extractIframeSrc($, referer)
  if (iframeSrc && depth < 1) {
    console.log(`[StreamResolver] iframe anidado → ${iframeSrc.slice(0, 80)}...`)
    return resolveStreamUrl(iframeSrc, depth + 1)
  }

  console.warn('[StreamResolver] No se pudo extraer stream del HTML')
  return null
}

/** Intenta extraer un StreamInfo del HTML usando múltiples estrategias */
function tryExtractStream($: cheerio.CheerioAPI, referer: string): StreamInfo | null {
  // Estrategia 1: video/source con .m3u8
  const m3u8Src =
    $('video source[src*=".m3u8"]').attr('src') ||
    $('video[src*=".m3u8"]').attr('src') ||
    $('source[src*=".m3u8"]').attr('src')
  if (m3u8Src) {
    return { url: makeAbsolute(m3u8Src, referer), type: 'hls', quality: 'HD', headers: { Referer: referer } }
  }

  // Estrategia 2: video/source con .mp4
  const mp4Src =
    $('video source[src*=".mp4"]').attr('src') ||
    $('video[src*=".mp4"]').attr('src')
  if (mp4Src) {
    return { url: makeAbsolute(mp4Src, referer), type: 'mp4', quality: 'HD', headers: { Referer: referer } }
  }

  // Estrategia 3: scripts con .m3u8 o config de video
  const scripts = $('script').toArray()
  for (const script of scripts) {
    const text = $(script).html() || ''
    if (!text) continue

    // .m3u8 literal en cadena
    const m3u8Match = text.match(/["']([^"']*\.m3u8[^"']*)["']/)
    if (m3u8Match) {
      return { url: m3u8Match[1], type: 'hls', quality: extractQuality(text), headers: { Referer: referer } }
    }

    // variable de configuración (src, url, file, videoUrl)
    const configMatch = text.match(/(?:src|url|file|videoUrl|video_url)\s*[:=]\s*["']([^"']+)["']/i)
    if (configMatch && /\.(m3u8|mp4)/i.test(configMatch[1])) {
      const isM3u8 = configMatch[1].includes('.m3u8')
      return { url: configMatch[1], type: isM3u8 ? 'hls' : 'mp4', quality: extractQuality(text), headers: { Referer: referer } }
    }

    // hls_url específico
    const hlsMatch = text.match(/hls_url\s*[:=]\s*["']([^"']+)["']/i)
    if (hlsMatch) {
      return { url: hlsMatch[1], type: 'hls', quality: extractQuality(text), headers: { Referer: referer } }
    }
  }

  // Estrategia 4: .m3u8 en el body HTML plano
  const bodyHtml = $('body').html() || ''
  const bodyMatch = bodyHtml.match(/["']([^"']*\.m3u8[^"']*)["']/)
  if (bodyMatch) {
    return { url: bodyMatch[1], type: 'hls', quality: 'HD', headers: { Referer: referer } }
  }

  return null
}

/** Extrae URL de iframe del HTML si existe */
function extractIframeSrc($: cheerio.CheerioAPI, referer: string): string | null {
  const iframeSrc = $('iframe[src]').attr('src')
  if (!iframeSrc) return null

  // Ignorar iframes de redes sociales
  if (iframeSrc.includes('google') || iframeSrc.includes('facebook') || iframeSrc.includes('twitter')) return null

  const absUrl = makeAbsolute(iframeSrc, referer)
  if (!absUrl || absUrl.includes(referer)) return null
  return absUrl
}

function makeAbsolute(url: string, base: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('//')) return `https:${url}`
  try {
    const baseUrl = new URL(base)
    return new URL(url, baseUrl.origin).href
  } catch {
    return url
  }
}

function extractQuality(text: string): string {
  const m = text.match(/["']?(1080|720|480|360|2160)\s*[pPi]?["']?/i)
  if (m) return m[1] === '2160' ? '4K' : `${m[1]}p`
  return 'HD'
}

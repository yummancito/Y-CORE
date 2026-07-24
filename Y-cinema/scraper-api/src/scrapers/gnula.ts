// gnula.ts — Scraper de Gnula.nu con Playwright (Cloudflare bypass)
// Gnula es un sitio de streaming en español latino con catálogo de
// películas y series. Usa Playwright para sortear Cloudflare.

import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'
import { browserPool } from '../browser-pool'
import { resolveStreamUrl } from '../stream-resolver'

export const GNULA_URL = 'https://gnula.nu'

export class GnulaScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'gnula',
    name: 'Gnula',
    enabled: true,
    timeout: 30000,
    priority: 15,
  }

  constructor(cache: ScraperCache) {
    super(cache)
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    const page = await browserPool.getPage()
    try {
      const encoded = encodeURIComponent(query)
      await page.goto(`${GNULA_URL}/buscar?q=${encoded}`, {
        waitUntil: 'networkidle',
      })

      // Esperar a que carguen los resultados (típicamente en .card o .item)
      try {
        await page.waitForSelector('.card, .item, article, .poster, .result-item', { timeout: 8000 })
      } catch {
        // Si no hay resultados, la página cargó vacía
      }

      const results: SearchResult[] = []

      // Extraer resultados con evaluate
      const items = await page.evaluate((baseUrl) => {
        const rows = document.querySelectorAll('.card, .item, article, .poster, [class*=result]')
        return Array.from(rows)
          .slice(0, 15)
          .map((el) => {
            const link = el.querySelector('a')
            const title = link?.getAttribute('title') || link?.textContent?.trim() || ''
            const href = link?.getAttribute('href') || ''
            const img = el.querySelector('img')?.getAttribute('src') || ''
            const yearMatch = title.match(/\(?(\d{4})\)?/)
            return {
              title,
              href: href.startsWith('http') ? href : `${baseUrl}${href}`,
              img,
              year: yearMatch ? parseInt(yearMatch[1]) : null,
              quality: '',
            }
          })
          .filter((r) => r.title.length > 2)
      }, GNULA_URL)

      for (const item of items) {
        const quality = this.detectQuality(item.title || item.href)
        const audioLang = this.detectAudioLang(item.title)

        results.push({
          id: `gnula:${Buffer.from(item.href || item.title).toString('base64').slice(0, 24)}`,
          title: item.title,
          year: item.year,
          source: 'gnula',
          sourceName: 'Gnula',
          quality,
          size: 'Stream',
          seeders: 999, // streaming directo, siempre disponible
          leechers: 0,
          url: item.href,
          audioLang,
          webFriendly: true, // streaming directo
          score: 0,
        })
      }

      return results.slice(0, 10)
    } catch (err) {
      console.warn(`[Gnula] Error en búsqueda:`, (err as Error).message)
      return []
    } finally {
      await browserPool.releasePage(page)
    }
  }

  /**
   * Resuelve la URL de stream desde la página de detalle de Gnula.
   * Sigue el flujo: detail page → iframe embed → .m3u8
   */
  async resolveStream(detailUrl: string): Promise<{ url: string; type: string; quality: string } | null> {
    if (!detailUrl) return null

    const page = await browserPool.getPage()
    try {
      await page.goto(detailUrl, { waitUntil: 'networkidle' })

      // Esperar iframe del reproductor
      try {
        await page.waitForSelector('iframe[src*="player"], iframe[src*="embed"], iframe[src*="video"]', { timeout: 10000 })
      } catch {
        // puede no haber iframe visible inmediatamente
      }

      // Extraer src del iframe
      const iframeSrc = await page.evaluate(() => {
        const iframe = document.querySelector<HTMLIFrameElement>(
          'iframe[src*="player"], iframe[src*="embed"], iframe[src*="video"], iframe[src]'
        )
        return iframe?.src || ''
      })

      if (!iframeSrc) {
        console.warn('[Gnula] No se encontró iframe embed')
        return null
      }

      console.log(`[Gnula] iframe embed: ${iframeSrc.slice(0, 100)}...`)

      // Resolver URL .m3u8 desde el iframe
      const stream = await resolveStreamUrl(iframeSrc)
      if (!stream) {
        console.warn('[Gnula] No se pudo resolver stream del embed')
        return null
      }

      return {
        url: stream.url,
        type: stream.type,
        quality: stream.quality,
      }
    } catch (err) {
      console.warn(`[Gnula] Error resolviendo stream:`, (err as Error).message)
      return null
    } finally {
      await browserPool.releasePage(page)
    }
  }
}

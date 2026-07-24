// cuevana.ts — Scraper de Cuevana con Playwright (Cloudflare bypass)
// Cuevana es el sitio de streaming en español latino más popular.
// Igual que Gnula, usa Playwright para sortear Cloudflare.

import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'
import { browserPool } from '../browser-pool'
import { resolveStreamUrl } from '../stream-resolver'

export const CUEVANA_URL = 'https://cuevana3.nu'

export class CuevanaScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'cuevana',
    name: 'Cuevana',
    enabled: true,
    timeout: 30000,
    priority: 16,
  }

  constructor(cache: ScraperCache) {
    super(cache)
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    const page = await browserPool.getPage()
    try {
      const encoded = encodeURIComponent(query)
      await page.goto(`${CUEVANA_URL}/search?q=${encoded}`, {
        waitUntil: 'networkidle',
      })

      try {
        await page.waitForSelector('.card, .item, article, .poster, .result-item', { timeout: 8000 })
      } catch {
        // sin resultados
      }

      const results: SearchResult[] = []

      const items = await page.evaluate((baseUrl) => {
        const rows = document.querySelectorAll(
          '.card, .item, article, .poster, [class*=result], [class*=movie], li.movie'
        )
        return Array.from(rows)
          .slice(0, 15)
          .map((el) => {
            const link = el.querySelector('a')
            const title = link?.getAttribute('title') || link?.textContent?.trim() || ''
            const href = link?.getAttribute('href') || ''
            const yearMatch = title.match(/\(?(\d{4})\)?/)
            // Imagen del poster
            const img =
              (el.querySelector('img') as HTMLImageElement)?.src ||
              (el.querySelector('[data-src]')?.getAttribute('data-src')) ||
              ''
            return {
              title: title.replace(/\s+/g, ' ').trim(),
              href: href.startsWith('http') ? href : `${baseUrl}/${href.replace(/^\//, '')}`,
              img,
              year: yearMatch ? parseInt(yearMatch[1]) : null,
            }
          })
          .filter((r) => r.title.length > 2)
      }, CUEVANA_URL)

      for (const item of items) {
        const quality = this.detectQuality(item.title || item.href)
        const audioLang = this.detectAudioLang(item.title)

        results.push({
          id: `cuevana:${Buffer.from(item.href || item.title).toString('base64').slice(0, 24)}`,
          title: item.title,
          year: item.year,
          source: 'cuevana',
          sourceName: 'Cuevana',
          quality,
          size: 'Stream',
          seeders: 999,
          leechers: 0,
          url: item.href,
          audioLang,
          webFriendly: true,
          score: 0,
        })
      }

      return results.slice(0, 10)
    } catch (err) {
      console.warn(`[Cuevana] Error en búsqueda:`, (err as Error).message)
      return []
    } finally {
      await browserPool.releasePage(page)
    }
  }

  /**
   * Resuelve la URL de stream desde la página de detalle de Cuevana.
   */
  async resolveStream(detailUrl: string): Promise<{ url: string; type: string; quality: string } | null> {
    if (!detailUrl) return null

    const page = await browserPool.getPage()
    try {
      await page.goto(detailUrl, { waitUntil: 'networkidle' })

      try {
        await page.waitForSelector('iframe[src*="player"], iframe[src*="embed"], iframe[src*="video"], iframe', {
          timeout: 10000,
        })
      } catch {
        // puede no tener iframe directo
      }

      const iframeSrc = await page.evaluate(() => {
        const iframe = document.querySelector<HTMLIFrameElement>(
          'iframe[src*="player"], iframe[src*="embed"], iframe[src*="video"], iframe[src]'
        )
        return iframe?.src || ''
      })

      if (!iframeSrc) {
        console.warn('[Cuevana] No se encontró iframe embed')
        return null
      }

      console.log(`[Cuevana] iframe embed: ${iframeSrc.slice(0, 100)}...`)

      const stream = await resolveStreamUrl(iframeSrc)
      if (!stream) return null

      return {
        url: stream.url,
        type: stream.type,
        quality: stream.quality,
      }
    } catch (err) {
      console.warn(`[Cuevana] Error resolviendo stream:`, (err as Error).message)
      return null
    } finally {
      await browserPool.releasePage(page)
    }
  }
}

// browser-pool.ts — Pool singleton de Chromium (Playwright) para scrapers
// que necesitan bypass de Cloudflare (Gnula, Cuevana, etc.)
// Lazy-init: el browser arranca en la primera request, no al importar.
//
// Nota histórica: con el flag --single-process, dos scrapers concurrentes
// (Gnula + Cuevana) crasheaban con "Target page, context or browser has been
// closed" al compartir el mismo proceso Chromium. NO hay ningún mutex/lock
// real aquí — getPage() no serializa nada. La mitigación real fue quitar
// --single-process (ver args más abajo): cada getPage() crea su propio
// BrowserContext aislado sobre el Browser singleton, que Playwright soporta
// de forma nativa y segura para llamadas concurrentes.

import { chromium, type Browser, type Page } from 'playwright'

const BROWSER_HEADLESS = process.env.SCRAPER_HEADLESS !== 'false'
const NAV_TIMEOUT = 30000

class BrowserPool {
  private browser: Browser | null = null
  private refCount = 0
  private initPromise: Promise<Browser> | null = null
  private lastUsed = 0
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 min sin uso → cerrar

  /** Obtiene o crea el browser singleton */
  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      this.lastUsed = Date.now()
      this.cancelCleanup()
      return this.browser
    }

    if (!this.initPromise) {
      this.initPromise = chromium.launch({
        headless: BROWSER_HEADLESS,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Sin --single-process: permite que múltiples scrapers (Gnula + Cuevana)
          // creen contextos/páginas en paralelo sin crash
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      })
    }

    try {
      this.browser = await this.initPromise
    } catch {
      this.initPromise = null
      throw new Error('[BrowserPool] No se pudo iniciar Chromium. Ejecutá: npx playwright install chromium')
    }
    this.refCount++
    this.lastUsed = Date.now()
    this.cancelCleanup()
    console.log(`[BrowserPool] Chromium iniciado (refs: ${this.refCount})`)
    return this.browser
  }

  /** Crea una página nueva lista para scrapear */
  async getPage(): Promise<Page> {
    const browser = await this.getBrowser()
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'es-ES',
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT)
    page.setDefaultNavigationTimeout(NAV_TIMEOUT)
    return page
  }

  /** Cierra una página devolviendo recursos al pool */
  async releasePage(page: Page): Promise<void> {
    try {
      await page.context().close()
    } catch {
      // ignorar errores al cerrar
    }
    this.scheduleCleanup()
  }

  /** Programa cierre del browser si nadie lo usa */
  private scheduleCleanup(): void {
    this.cancelCleanup()
    this.cleanupTimer = setTimeout(() => {
      this.cleanup()
    }, this.IDLE_TIMEOUT_MS)
  }

  private cancelCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private async cleanup(): Promise<void> {
    if (!this.browser?.isConnected()) return
    if (Date.now() - this.lastUsed < this.IDLE_TIMEOUT_MS) return
    try {
      await this.browser.close()
      console.log('[BrowserPool] Chromium cerrado por inactividad')
    } catch {
      // ignorar
    }
    this.browser = null
    this.initPromise = null
    this.refCount = 0
  }

  /** Cierra el browser forzosamente (para shutdown) */
  async shutdown(): Promise<void> {
    this.cancelCleanup()
    if (this.browser?.isConnected()) {
      try {
        await this.browser.close()
      } catch {
        // ignorar
      }
    }
    this.browser = null
    this.initPromise = null
    this.refCount = 0
    console.log('[BrowserPool] Chromium cerrado')
  }
}

// Singleton
export const browserPool = new BrowserPool()

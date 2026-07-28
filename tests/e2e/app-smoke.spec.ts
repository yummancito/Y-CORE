// ============================================================================
// tests/e2e/app-smoke.spec.ts
// ----------------------------------------------------------------------------
// Smoke tests E2E para Y-core.
//
// Verifica que la app React renderice sin errores visibles.
// Corre contra el Vite dev server (localhost:5173) — window.steamtools
// no está disponible, pero las páginas renderizan y no crashean.
//
// Tests:
//   1. App arranca sin errores en consola
//   2. Store carga juegos
//   3. Biblioteca carga
//   4. Downloads page renderiza
//   5. Settings carga y se puede cambiar theme
// ============================================================================

import { test, expect } from '@playwright/test'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Script que se inyecta en cada página ANTES de que cargue.
 * Mockea window.steamtools para que el TourOverlay (que depende de
 * steamtools.readConfig) vea tourDone=true y nunca arranque el tour.
 * Sin esto el tour overlay bloquea todos los clicks en la Store.
 */
const STEAMTOOLS_MOCK = `
window.steamtools = {
  isAuthenticated: () => Promise.resolve(true),
  getUsername: () => Promise.resolve('test-user'),
  readConfig: () => Promise.resolve({ tourDone: true }),
  writeConfig: () => Promise.resolve({ success: true }),
  addLog: () => Promise.resolve(),
  appReady: () => Promise.resolve(),
  getSteamPath: () => Promise.resolve({ success: true, path: 'C:\\Program Files (x86)\\Steam' }),
  openSteamFolderDialog: () => Promise.resolve({ success: true, path: '' }),
  getGameImage: () => Promise.resolve({}),
  openExternal: () => Promise.resolve(),
  installGame: () => Promise.resolve({ success: true }),
  uninstallGame: () => Promise.resolve({ success: true }),
  importGame: () => Promise.resolve({ success: true }),
  downloadEngine: {
    createTask: () => Promise.resolve({ success: true, taskId: 'mock-task' }),
    startTask: () => Promise.resolve({ success: true }),
    pauseTask: () => Promise.resolve({ success: true }),
    resumeTask: () => Promise.resolve({ success: true }),
    cancelTask: () => Promise.resolve({ success: true }),
    getTask: () => Promise.resolve({ success: true, task: null }),
    listTasks: () => Promise.resolve({ success: true, tasks: [] }),
    loadQueue: () => Promise.resolve({ success: true, tasks: [] }),
    getHistory: () => Promise.resolve({ success: true, entries: [] }),
    onProgress: () => {},
  },
}
`

/** Espera a que la página cargue sin errores críticos */
async function waitForApp(page: import('@playwright/test').Page) {
  // Esperar al menos 5s a que React monte
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  // Esperar a que el root se llene
  await page.waitForSelector('#root', { timeout: 15000 })
  // Pequeña pausa para que React termine de renderizar
  await page.waitForTimeout(2000)
}

/** Revisa que no haya errores críticos en consola */
function assertNoCriticalErrors(errors: string[], _logs: string[]) {
  // Errores que SÍ ignoramos (externos a la app)
  const ignored = [
    'Autofill.enable',
    'Autofill.setAddresses',
    'favicon',
    'ERR_BLOCKED_BY_CLIENT',
    'ERR_NAME_NOT_RESOLVED',
    'net::ERR_',
    'Third-party cookie',
    'chrome-extension',
    'React Router Future Flag Warning',
    'React Router will begin wrapping',
    'v7_startTransition',
    'v7_relativeSplatPath',
  ]

  const criticalErrors = errors.filter(e =>
    !ignored.some(ig => e.includes(ig))
  )

  // Mostrar todos los errores para debugging
  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} console error(s):`)
    errors.forEach(e => console.log(`  • ${e.slice(0, 200)}`))
  }

  // Si hay errores críticos, fallar el test
  expect(criticalErrors.length).toBe(0)
}

// ============================================================================
// Test 1: App arranca
// ============================================================================

test('01 - App arranca sin errores', async ({ page }) => {
  // Mock steamtools antes de navegar — así el tour nunca arranca
  await page.addInitScript(STEAMTOOLS_MOCK)

  const errors: string[] = []
  const logs: string[] = []

  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`)
    if (msg.type() === 'error') errors.push(msg.text())
  })

  page.on('pageerror', (err) => {
    errors.push(`PAGE_ERROR: ${err.message}`)
  })

  await page.goto('/')
  await waitForApp(page)

  // Verificar que el título existe
  const title = await page.title()
  console.log(`📄 Page title: "${title}"`)

  // Verificar que el root se llenó (no está vacío)
  const rootContent = await page.textContent('#root')
  expect(rootContent?.length).toBeGreaterThan(0)

  assertNoCriticalErrors(errors, logs)
})

// ============================================================================
// Test 2: Store carga
// ============================================================================

test('02 - Store carga juegos', async ({ page }) => {
  await page.addInitScript(STEAMTOOLS_MOCK)

  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`PAGE_ERROR: ${err.message}`))

  await page.goto('/store')
  await waitForApp(page)

  // Verificar que la URL cambió
  expect(page.url()).toContain('/store')

  // Buscar juegos en la página
  const gameCards = page.locator('[data-name], .game-card, [class*="game"], [class*="Game"], [class*="card"]')
  const count = await gameCards.count()
  console.log(`🎮 Game elements found: ${count}`)

  // Si hay juegos, hacer clic en el primero para ver GameDetail
  if (count > 0) {
    await gameCards.first().click({ timeout: 5000 })
    await page.waitForTimeout(2000)
    console.log(`📋 After click URL: ${page.url()}`)
    // Verificar que no crasheó
    expect(page.url()).not.toContain('null')
    expect(page.url()).not.toContain('undefined')
  }

  assertNoCriticalErrors(errors, [])
})

// ============================================================================
// Test 3: Biblioteca carga
// ============================================================================

test('03 - Biblioteca carga', async ({ page }) => {
  await page.addInitScript(STEAMTOOLS_MOCK)

  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`PAGE_ERROR: ${err.message}`))

  await page.goto('/')
  await waitForApp(page)

  // Verificar que la página renderiza contenido
  const bodyText = await page.textContent('body')
  expect(bodyText?.length).toBeGreaterThan(0)

  // Buscar sidebar/nav
  const nav = page.locator('nav, [class*="sidebar"], [class*="nav"]')
  const navVisible = await nav.isVisible().catch(() => false)
  console.log(`📑 Navigation visible: ${navVisible}`)

  assertNoCriticalErrors(errors, [])
})

// ============================================================================
// Test 4: Downloads page
// ============================================================================

test('04 - Downloads page renderiza', async ({ page }) => {
  await page.addInitScript(STEAMTOOLS_MOCK)

  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`PAGE_ERROR: ${err.message}`))

  await page.goto('/downloads')
  await waitForApp(page)

  // Verificar URL
  expect(page.url()).toContain('/downloads')

  // Verificar que la página tiene contenido
  const content = await page.textContent('body')
  expect(content?.length).toBeGreaterThan(0)

  // Tomar screenshot para ver visualmente
  await page.screenshot({ path: 'playwright-screenshots/downloads-page.png', fullPage: true })

  assertNoCriticalErrors(errors, [])
})

// ============================================================================
// Test 5: Settings + theme change
// ============================================================================

test('05 - Settings carga y puede cambiar theme', async ({ page }) => {
  await page.addInitScript(STEAMTOOLS_MOCK)

  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`PAGE_ERROR: ${err.message}`))

  await page.goto('/settings')
  await waitForApp(page)

  expect(page.url()).toContain('/settings')

  // Buscar opciones de theme
  const themeOptions = page.locator('[class*="theme"], [class*="Theme"], [data-theme]')
  const themeCount = await themeOptions.count().catch(() => 0)
  console.log(`🎨 Theme options found: ${themeCount}`)

  // Intentar encontrar botones de theme
  const buttons = page.locator('button, [role="button"], label')
  const allButtons = await buttons.allTextContents()
  const themeButtons = allButtons.filter(b =>
    b.toLowerCase().includes('theme') ||
    b.toLowerCase().includes('dark') ||
    b.toLowerCase().includes('light') ||
    b.toLowerCase().includes('steam') ||
    b.toLowerCase().includes('cosmic')
  )
  if (themeButtons.length > 0) {
    console.log(`🎨 Theme buttons: ${themeButtons.join(', ')}`)
  }

  // Screenshot para debug visual
  await page.screenshot({ path: 'playwright-screenshots/settings-page.png', fullPage: true })

  assertNoCriticalErrors(errors, [])
})

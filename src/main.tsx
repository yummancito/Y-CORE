import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { detectSystemLanguage, setLanguage } from './lib/i18n'

function applySystemTheme(root: HTMLElement) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  root.classList.toggle('theme-dark', prefersDark)
  root.classList.toggle('theme-light', !prefersDark)
}

async function bootstrap() {
  const root = document.documentElement
  applySystemTheme(root)

  // Load saved color theme
  let colorTheme = 'ct-y-core'
  try {
    const cfg = (await window.steamtools?.readConfig?.()) as any
    if (cfg?.colorTheme) colorTheme = cfg.colorTheme
  } catch {}
  root.classList.add(colorTheme)

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applySystemTheme(root)
  })

  // Detect system language from Electron locale or browser
  let locale = navigator.language || 'es'
  try {
    locale = await window.steamtools?.getLocale?.() || locale
  } catch {}
  setLanguage(detectSystemLanguage(locale))

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </HashRouter>
    </React.StrictMode>,
  )
}

bootstrap()

import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { detectSystemLanguage, setLanguage } from './lib/i18n'

async function bootstrap() {
  const root = document.documentElement
  root.classList.add('theme-dark')

  // Load saved color theme
  let colorTheme = 'ct-y-core'
  try {
    const cfg = (await window.steamtools?.readConfig?.()) as any
    if (cfg?.colorTheme) colorTheme = cfg.colorTheme
  } catch {}
  root.classList.add(colorTheme)

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

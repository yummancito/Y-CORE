import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { EpicSidebar } from './EpicSidebar'
import { TitleBar } from './TitleBar'
import { useSteamStore } from '../../stores/useSteamStore'
import { useToastStore } from '../../stores/useToastStore'

interface PageHeaderContextValue {
  setHeader: (header: ReactNode) => void
}

const PageHeaderContext = createContext<PageHeaderContextValue>({ setHeader: () => {} })

export function usePageHeader(header: ReactNode, deps: React.DependencyList = []) {
  const { setHeader } = useContext(PageHeaderContext)
  const memoizedHeader = useMemo(() => header, deps)
  useEffect(() => {
    setHeader(memoizedHeader)
    return () => setHeader(null)
  }, [memoizedHeader, setHeader])
}

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { showToast } = useToastStore()
  const { init: initSteam } = useSteamStore()
  const [pickMode, setPickMode] = useState(false)
  const [pageHeader, setPageHeader] = useState<ReactNode>(null)

  useEffect(() => {
    initSteam()
    const interval = setInterval(() => {
      useSteamStore.getState().loadSteamRunning()
    }, 5000)
    return () => clearInterval(interval)
  }, [initSteam])

  // Global Pick mode: only in development builds
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        setPickMode(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!pickMode) return
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement
      // Find nearest section label
      let el: HTMLElement | null = target
      let section = ''
      let gameName = ''
      while (el && el !== document.body) {
        if (!section && el.dataset.section) section = el.dataset.section
        if (!gameName && el.dataset.name) gameName = el.dataset.name
        if (section && gameName) break
        el = el.parentElement
      }
      // Build a short selector
      let selector = target.tagName.toLowerCase()
      if (target.id) selector += `#${target.id}`
      if (target.className && typeof target.className === 'string') {
        const c = target.className.split(' ').filter(Boolean).slice(0, 2)
        if (c.length) selector += `.${c.join('.')}`
      }
      // Format output
      let output = ''
      if (gameName) output += `Game: ${gameName}\n`
      if (section) output += `Section: ${section}\n`
      output += `Element: ${selector}`
      navigator.clipboard.writeText(output)
      showToast('success', gameName ? `Game: ${gameName}` : section ? `Section: ${section}` : selector)
      setPickMode(false)
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [pickMode, showToast])

  return (
    <PageHeaderContext.Provider value={{ setHeader: setPageHeader }}>
      <div className={`flex h-screen w-screen relative overflow-hidden bg-bg-primary ${pickMode ? 'pick-mode' : ''}`}>
        <div className="flex h-full w-full relative z-[1]">
          <EpicSidebar />
          <div className="flex flex-col flex-1 h-full min-w-0" data-section="Main Content">
            <TitleBar header={pageHeader} />
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>
      </div>
    </PageHeaderContext.Provider>
  )
}

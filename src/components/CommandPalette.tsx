import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  PlusCircle,
  Power,
  Library,
  ScrollText,
  UploadCloud,
  CornerDownLeft,
} from 'lucide-react'
import { useCommandPaletteStore } from '../stores/useCommandPaletteStore'
import { useSteamStore } from '../stores/useSteamStore'
import { useToastStore } from '../stores/useToastStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { t } from '../lib/i18n'

interface Command {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  category: string
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPaletteStore()
  const navigate = useNavigate()
  const { restartSteam } = useSteamStore()
  const { showToast } = useToastStore()
  const { games, setSelectedGame } = useLibraryStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      { id: 'go-library', label: t('commandPalette.goLibrary'), icon: Library, category: t('commandPalette.categoryNavigation'), action: () => navigate('/') },
      { id: 'go-add-game', label: t('commandPalette.addGame'), icon: PlusCircle, category: t('commandPalette.categoryActions'), action: () => navigate('/add-game') },
      { id: 'go-import', label: t('commandPalette.importGameFolder'), icon: UploadCloud, category: t('commandPalette.categoryActions'), action: () => navigate('/import-game') },
      { id: 'go-logs', label: t('commandPalette.viewLogs'), icon: ScrollText, category: t('commandPalette.categoryNavigation'), action: () => navigate('/logs') },
      {
        id: 'restart-steam',
        label: t('commandPalette.restartSteam'),
        icon: Power,
        category: t('commandPalette.categoryActions'),
        action: async () => {
          showToast('info', t('library.restarting'))
          const result = await restartSteam()
          showToast(result.success ? 'success' : 'error', result.success ? t('library.steamRestarted') : (result.error || t('common.failed')))
        },
      },
    ]

    // Add game search results
    if (query.length > 0) {
      const matched = games
        .filter((g) => g.name.toLowerCase().includes(query.toLowerCase()) || g.appId.includes(query))
        .slice(0, 5)
        .map((g) => ({
          id: `game-${g.appId}`,
          label: `${g.name} (${g.appId})`,
          icon: Library,
          category: t('commandPalette.categoryGames'),
          action: () => {
            setSelectedGame(g)
            navigate('/')
          },
        }))
      cmds.push(...matched)
    }

    return cmds
  }, [navigate, restartSteam, showToast, games, query, setSelectedGame])

  const filtered = useMemo(() => {
    if (!query) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
  }, [commands, query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filtered[selectedIndex]
        if (cmd) {
          cmd.action()
          close()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, filtered, selectedIndex, close])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!isOpen) return null

  // Group by category
  const categories = [...new Set(filtered.map((c) => c.category))]

  let flatIndex = 0

  return (
    <div
      className="fixed inset-0 flex items-start justify-center z-[70] pt-24 animate-fade-in bg-black/50 backdrop-blur-sm"
      onClick={close}
      role="presentation"
      onKeyDown={(e) => { if (e.key === 'Escape') close() }}
    >
      <div
        className="w-full max-w-xl rounded-xl overflow-hidden bg-surface/80 backdrop-blur-2xl border border-border-hover shadow-modal animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.commandPalette')}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-text-dim" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('commandPalette.search')}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
            aria-label={t('commandPalette.searchAria')}
          />
          <kbd className="text-xs text-text-dim bg-surface-light/50 px-1.5 py-0.5 rounded">{t('commandPalette.esc')}</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-dim">{t('commandPalette.noResults')}</div>
          ) : (
            categories.map((category) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-xs font-semibold text-text-dim uppercase tracking-wider">{category}</div>
                {filtered
                  .filter((c) => c.category === category)
                  .map((cmd) => {
                    const idx = flatIndex++
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => {
                          cmd.action()
                          close()
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          selectedIndex === idx ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-surface-light/30'
                        }`}
                      >
                        <cmd.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm flex-1">{cmd.label}</span>
                        {selectedIndex === idx && <CornerDownLeft className="w-3 h-3 text-text-dim" />}
                      </button>
                    )
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

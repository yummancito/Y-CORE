import { useState, useCallback } from 'react'
import { UploadCloud, Loader2, CheckCircle2, XCircle, RefreshCw, FolderOpen, Package, FileCode, Zap } from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useSteamStore } from '../stores/useSteamStore'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

interface ActionResult {
  type: 'success' | 'error' | 'info'
  message: string
}

export default function ImportGame() {
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ActionResult[]>([])
  const [importedGames, setImportedGames] = useState<{ appId: string; name: string }[]>([])
  const { showToast } = useToastStore()
  const { restartSteam } = useSteamStore()

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const firstFile = files[0]
    const filePath = window.steamtools.getPathForFile(firstFile)
    const folderPath = filePath.substring(0, filePath.lastIndexOf('\\'))

    if (!folderPath) {
      setResults([{ type: 'error', message: 'Could not determine folder path' }])
      return
    }

    await doImport(folderPath)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const doImport = async (folderPath: string) => {
    setImporting(true)
    setResults([])
    setImportedGames([])

    try {
      const result = await window.steamtools.importGameFolder({ folderPath })

      if (!result.success) {
        setResults([{ type: 'error', message: result.error || 'Import failed' }])
        return
      }

      const actions: ActionResult[] = []

      if (result.actions) {
        for (const action of result.actions) {
          actions.push({ type: 'info', message: action })
        }
      }

      if (result.errors && result.errors.length > 0) {
        for (const err of result.errors) {
          actions.push({ type: 'error', message: err })
        }
      }

      actions.push({ type: 'success', message: t('importgame.importSummary').replace('{{luaCount}}', String(result.luaCount)).replace('{{manifestCount}}', String(result.manifestCount)) })

      setResults(actions)
      setImportedGames(result.importedGames || [])
      showToast('success', t('importgame.importCompleted'))
    } catch (err: any) {
      setResults([{ type: 'error', message: err.message }])
    } finally {
      setImporting(false)
    }
  }

  const handleRestartSteam = async () => {
    showToast('info', t('importgame.restartingSteam'))
    const result = await restartSteam()
    if (result.success) {
      setResults(prev => [...prev, { type: 'success', message: t('importgame.steamRestarted') }])
      showToast('success', t('library.steamRestarted'))
    } else {
      setResults(prev => [...prev, { type: 'error', message: result.error || t('importgame.failedRestartSteam') }])
      showToast('error', result.error || t('importgame.failedRestartSteam'))
    }
  }

  return (
    <div data-section="Import Game" className="max-w-3xl mx-auto space-y-4 animate-fade-in p-6">
      <div>
        <h1 className="text-2xl font-bold mb-2 text-text-bright">{t('importgame.title')}</h1>
        <p className="text-sm text-text-dim">{t('importgame.subtitle')}</p>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
          isDragging
            ? 'border-accent bg-accent/10 scale-[1.02]'
            : 'border-border hover:border-border-hover'
        }`}
      >
        {importing ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-accent" />
            <p className="font-medium text-text-bright">{t('importgame.importing')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging ? 'bg-accent/20' : 'bg-accent/10'
            }`}>
              <UploadCloud className={`w-8 h-8 transition-colors ${
                isDragging ? 'text-accent' : 'text-accent/60'
              }`} />
            </div>
            <div>
              <p className="font-semibold text-lg text-text-bright">
                {isDragging ? t('importgame.dropHere') : t('importgame.dragDrop')}
              </p>
              <p className="text-sm mt-1 text-text-dim">{t('importgame.subtitle')}</p>
            </div>
          </div>
        )}
      </div>

      {/* What happens info */}
      <div className="grid grid-cols-3 gap-3">
        <Card variant="base">
          <FileCode className="w-5 h-5 text-accent mb-2" />
          <p className="text-text-bright text-sm font-medium">Lua → stplug-in</p>
          <p className="text-text-dim text-xs mt-1">Depot keys & manifest IDs</p>
        </Card>
        <Card variant="base">
          <Package className="w-5 h-5 text-accent mb-2" />
          <p className="text-text-bright text-sm font-medium">Manifests → depotcache</p>
          <p className="text-text-dim text-xs mt-1">Game file manifests</p>
        </Card>
        <Card variant="base">
          <Zap className="w-5 h-5 text-accent mb-2" />
          <p className="text-text-bright text-sm font-medium">Hook DLL installed</p>
          <p className="text-text-dim text-xs mt-1">Ownership injection</p>
        </Card>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm uppercase tracking-wider mb-3 text-text-bright">{t('importgame.importLog')}</h2>
          <div className="rounded-lg p-4 border border-border bg-surface-darker/60 max-h-64 overflow-y-auto">
            {results.map((result, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                {result.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />}
                {result.type === 'error' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                {result.type === 'info' && <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 mt-2" />}
                <span className={`text-sm ${
                  result.type === 'error' ? 'text-red-400' :
                  result.type === 'success' ? 'text-green-400' :
                  'text-text-dim'
                }`}>{result.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Imported Games */}
      {importedGames.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm uppercase tracking-wider mb-3 text-text-bright">{t('importgame.importedGames')}</h2>
          <div className="space-y-2">
            {importedGames.map((game) => (
              <div key={game.appId} className="flex items-center justify-between rounded-lg p-3 border border-border bg-surface/30">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-accent" />
                  <div>
                    <p className="text-text-bright font-medium text-sm">{game.name}</p>
                    <p className="text-text-dim text-xs">AppID: {game.appId}</p>
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restart Steam button */}
      {results.length > 0 && !importing && (
        <div className="flex justify-end">
          <Button variant="primary" icon={RefreshCw} onClick={handleRestartSteam}>
            {t('importgame.restartSteam')}
          </Button>
        </div>
      )}
    </div>
  )
}

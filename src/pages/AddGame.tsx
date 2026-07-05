import { useState, useCallback, useRef } from 'react'
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  FileCode,
  Package,
  FileText,
  Power,
  ShieldAlert,
  X,
  Gamepad2,
  CloudUpload,
  FolderOpen,
  Trash,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useSteamStore } from '../stores/useSteamStore'
import { usePageHeader } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { getCoverUrl } from '../domain/utils'

interface ImportedFile {
  name: string
  path: string
  type: 'lua' | 'manifest' | 'acf' | 'unknown'
  status: 'pending' | 'imported' | 'error' | 'awaiting-confirm' | 'rejected'
  message?: string
  appId?: string
  gameName?: string
}

interface SuspiciousFile {
  name: string
  path: string
  reason: string
  severity: 'high' | 'medium' | 'low'
}

const SUSPICIOUS_PATTERNS: { pattern: RegExp; reason: string; severity: 'high' | 'medium' | 'low' }[] = [
  { pattern: /\.(exe|scr|com|bat|cmd|ps1|vbs|js|jar)$/i, reason: 'Executable script file', severity: 'high' },
  { pattern: /\.(dll|sys|drv)$/i, reason: 'System library file', severity: 'medium' },
  { pattern: /\.(tmp|log|cache)$/i, reason: 'Temporary/cache file', severity: 'low' },
  { pattern: /crack|patch|keygen|serial|activator|loader/i, reason: 'Suspicious name (crack/keygen)', severity: 'high' },
  { pattern: /\.(zip|rar|7z|tar|gz)$/i, reason: 'Archive file — should not be in Steam dir', severity: 'medium' },
]

function checkSuspicious(fileName: string): SuspiciousFile | null {
  for (const { pattern, reason, severity } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(fileName)) {
      return { name: fileName, path: '', reason, severity }
    }
  }
  return null
}

export default function AddGame() {
  usePageHeader(
    <div>
      <h1 className="text-lg font-bold text-text-bright">{t('addgame.title')}</h1>
      <p className="text-[11px] text-text-dim">{t('addgame.subtitle')}</p>
    </div>,
    []
  )

  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [importing, setImporting] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<ImportedFile | null>(null)
  const [coverError, setCoverError] = useState(false)
  const [suspiciousFiles, setSuspiciousFiles] = useState<SuspiciousFile[]>([])
  const [closingSteam, setClosingSteam] = useState(false)
  const [steamClosed, setSteamClosed] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToastStore()
  const { restartSteam } = useSteamStore()

  const detectFileType = (fileName: string): ImportedFile['type'] => {
    if (fileName.endsWith('.lua')) return 'lua'
    if (fileName.endsWith('.manifest')) return 'manifest'
    if (fileName.endsWith('.acf')) return 'acf'
    return 'unknown'
  }

  const processFiles = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return

    // Check for suspicious files
    const suspicious: SuspiciousFile[] = []
    for (const f of fileList) {
      const check = checkSuspicious(f.name)
      if (check) {
        check.path = window.steamtools.getPathForFile(f)
        suspicious.push(check)
      }
    }
    if (suspicious.length > 0) {
      setSuspiciousFiles((prev) => [...prev, ...suspicious])
    }

    // Filter out suspicious files from import
    const safeFiles = fileList.filter((f) => !checkSuspicious(f.name))
    if (safeFiles.length === 0) {
      showToast('warning', 'All files flagged as suspicious')
      return
    }

    if (safeFiles.length > 0) {
      setSelectedFileName(safeFiles[0].name)
    }

    const newFiles: ImportedFile[] = safeFiles.map((f) => ({
      name: f.name,
      path: window.steamtools.getPathForFile(f),
      type: detectFileType(f.name),
      status: 'pending',
    }))

    setFiles((prev) => [...prev, ...newFiles])
    setImporting(true)

    for (const file of newFiles) {
      try {
        if (file.type === 'lua') {
          // Only parse the Lua to get appId — don't import yet
          const parseResult = await window.steamtools.parseLuaScript({ luaPath: file.path })
          if (parseResult.success && parseResult.parsed && parseResult.parsed.appIds.length > 0) {
            const appId = parseResult.parsed.appIds[0].id
            try {
              const searchResult = await window.steamtools.searchGames(appId)
              const gameMatch = searchResult.results?.find((r) => r.appId === appId)
              const gameName = gameMatch?.name || parseResult.parsed!.appIds[0].type || `App ${appId}`

              setFiles((prev) => prev.map((f) => f.path === file.path ? {
                ...f,
                status: 'awaiting-confirm' as const,
                appId,
                gameName,
                message: 'Awaiting confirmation',
              } : f))

              setPendingConfirm({
                ...file,
                status: 'awaiting-confirm' as const,
                appId,
                gameName,
                message: 'Awaiting confirmation',
              })
              setCoverError(false)
            } catch {
              setFiles((prev) => prev.map((f) => f.path === file.path ? {
                ...f,
                status: 'awaiting-confirm' as const,
                appId,
                gameName: `App ${appId}`,
                message: 'Awaiting confirmation',
              } : f))
              setPendingConfirm({
                ...file,
                status: 'awaiting-confirm' as const,
                appId,
                gameName: `App ${appId}`,
                message: 'Awaiting confirmation',
              })
              setCoverError(false)
            }
          } else {
            setFiles((prev) => prev.map((f) => f.path === file.path ? {
              ...f,
              status: 'error' as const,
              message: parseResult.error || 'Failed to parse Lua script',
            } : f))
          }
        } else if (file.type === 'manifest') {
          const result = await window.steamtools.importManifest({ manifestPath: file.path })
          setFiles((prev) => prev.map((f) => f.path === file.path ? {
            ...f,
            status: result.success ? 'imported' as const : 'error' as const,
            message: result.success ? 'Copied to depotcache' : result.error,
          } : f))
        } else if (file.type === 'acf') {
          const result = await window.steamtools.importManifest({ manifestPath: file.path })
          setFiles((prev) => prev.map((f) => f.path === file.path ? {
            ...f,
            status: result.success ? 'imported' as const : 'error' as const,
            message: result.success ? 'Copied to steamapps' : result.error,
          } : f))
        } else {
          setFiles((prev) => prev.map((f) => f.path === file.path ? {
            ...f,
            status: 'error' as const,
            message: 'Unsupported file type',
          } : f))
        }
      } catch (err: any) {
        setFiles((prev) => prev.map((f) => f.path === file.path ? {
          ...f,
          status: 'error' as const,
          message: err.message,
        } : f))
      }
    }

    setImporting(false)
  }, [showToast])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    await processFiles(droppedFiles)
  }, [processFiles])

  const handleFileBrowse = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    await processFiles(fileList)
    e.target.value = ''
  }, [processFiles])

  const confirmGame = async () => {
    if (!pendingConfirm) return
    setClosingSteam(true)

    try {
      const result = await window.steamtools.importLuaScript({ luaPath: pendingConfirm.path })
      setClosingSteam(false)
      if (result.success) {
        setSteamClosed(true)
        setFiles((prev) => prev.map((f) => f.path === pendingConfirm.path ? {
          ...f,
          status: 'imported' as const,
          message: 'Imported successfully',
        } : f))
        showToast('success', `Game confirmed: ${pendingConfirm.gameName}`)
      } else {
        setFiles((prev) => prev.map((f) => f.path === pendingConfirm.path ? {
          ...f,
          status: 'error' as const,
          message: result.error || 'Import failed',
        } : f))
        showToast('error', result.error || 'Import failed')
      }
    } catch (err: any) {
      setClosingSteam(false)
      setFiles((prev) => prev.map((f) => f.path === pendingConfirm.path ? {
        ...f,
        status: 'error' as const,
        message: err.message,
      } : f))
      showToast('error', err.message)
    }

    setPendingConfirm(null)
  }

  const rejectGame = () => {
    if (!pendingConfirm) return
    setFiles((prev) => prev.map((f) => f.path === pendingConfirm.path ? {
      ...f,
      status: 'rejected' as const,
      message: 'Rejected by user',
    } : f))
    setPendingConfirm(null)
    showToast('info', 'Game rejected')
  }

  const removeSuspicious = (index: number) => {
    setSuspiciousFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRestartSteam = async () => {
    showToast('info', t('library.restarting'))
    const result = await restartSteam()
    if (result.success) {
      showToast('success', t('library.steamRestarted'))
    } else {
      showToast('error', result.error || t('common.failed'))
    }
  }

  const fileIcon = (type: ImportedFile['type']) => {
    if (type === 'lua') return <FileCode className="w-5 h-5 text-green-400" />
    if (type === 'manifest') return <Package className="w-5 h-5 text-accent" />
    if (type === 'acf') return <FileText className="w-5 h-5 text-purple-400" />
    return <FileText className="w-5 h-5 text-text-dim" />
  }

  return (
    <div data-section="Add Game" className="space-y-4 animate-fade-in p-6">
      {/* Suspicious Files Warning */}
      {suspiciousFiles.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Suspicious Files Detected ({suspiciousFiles.length})</span>
          </div>
          <p className="text-xs text-red-300/80">
            These files may contain malware or are not typical Steam game files. We recommend removing them.
          </p>
          <div className="space-y-2">
            {suspiciousFiles.map((sf, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sf.severity === 'high' ? 'bg-red-500' : sf.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{sf.name}</p>
                  <p className="text-[10px] text-text-dim">{sf.reason} · {sf.severity} severity</p>
                </div>
                <button
                  onClick={() => removeSuspicious(i)}
                  className="p-1.5 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Card */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-between gap-3 p-4 rounded-2xl transition-all duration-300 ${
          dragOver ? 'bg-accent/5 scale-[1.01]' : 'bg-surface-darker/30'
        }`}
      >
        {/* Header — drop zone */}
        <div
          className={`flex-1 w-full flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer ${
            dragOver
              ? 'border-accent bg-accent/10'
              : 'border-border hover:border-accent/40 hover:bg-accent/5'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <CloudUpload className={`w-16 h-16 mb-3 transition-all duration-300 ${dragOver ? 'text-accent scale-110' : 'text-accent/50'}`} />
          <p className="text-base font-semibold text-text-bright text-center px-4">
            {dragOver ? t('addgame.dropHere') : t('addgame.browseFile')}
          </p>
          <p className="text-xs mt-2 text-text-dim max-w-sm text-center px-4">{t('addgame.dropHint')}</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-green-500/30 bg-green-500/10 text-green-400">
              <FileCode className="w-3.5 h-3.5" /> .lua
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-accent/30 bg-accent/10 text-accent">
              <Package className="w-3.5 h-3.5" /> .manifest
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <FileText className="w-3.5 h-3.5" /> .acf
            </span>
          </div>
        </div>

        {/* Footer — file status bar */}
        <label
          htmlFor="file-browse"
          className="w-full h-11 px-3 rounded-xl flex items-center gap-3 cursor-pointer bg-surface border border-border hover:border-accent/40 transition-colors"
        >
          <FolderOpen className="w-5 h-5 text-accent flex-shrink-0" />
          <span className="flex-1 text-sm text-text-dim truncate text-center">
            {selectedFileName || t('addgame.noFileSelected')}
          </span>
          {selectedFileName && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedFileName(null); setFiles([]) }}
              className="p-1 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <Trash className="w-4 h-4" />
            </button>
          )}
          <input
            id="file-browse"
            ref={fileInputRef}
            type="file"
            multiple
            accept=".lua,.manifest,.acf"
            onChange={handleFileBrowse}
            className="hidden"
          />
        </label>
      </div>

      {/* Game Confirmation Dialog */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl border border-border bg-surface max-w-md w-full overflow-hidden shadow-2xl">
            {/* Cover */}
            <div className="relative h-48 overflow-hidden">
              {coverError ? (
                <div className="w-full h-full flex items-center justify-center bg-accent/10">
                  <Gamepad2 className="w-16 h-16 text-accent opacity-50" />
                </div>
              ) : (
                <img
                  src={getCoverUrl(pendingConfirm.appId || '')}
                  alt={pendingConfirm.gameName}
                  className="w-full h-full object-cover"
                  onError={() => setCoverError(true)}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-xs text-white/50 font-mono">AppID: {pendingConfirm.appId}</p>
                <h3 className="text-lg font-bold text-white truncate">{pendingConfirm.gameName}</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-5">
              {closingSteam ? (
                <div className="flex items-center gap-3 py-4">
                  <Loader className="w-5 h-5 animate-spin text-accent" />
                  <span className="text-sm text-text-primary">Importing...</span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-text-primary mb-1">Is this your game?</p>
                  <p className="text-xs text-text-dim mb-2">
                    Confirm that this is the correct game before importing the Lua script.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="danger" className="flex-1 justify-center" icon={X} onClick={rejectGame}>
                      No, reject
                    </Button>
                    <Button variant="primary" className="flex-1 justify-center" icon={CheckCircle} onClick={confirmGame}>
                      Yes, import it
                    </Button>
                  </div>
                </>
              )}
              {steamClosed && !closingSteam && (
                <div className="mt-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400">Import complete — restart Steam to apply.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Imported Files List */}
      {files.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-bright">
              {t('addgame.importedFiles')} ({files.length})
            </h3>
            <button onClick={() => setFiles([])} className="text-xs text-text-dim hover:opacity-80">
              {t('common.clear')}
            </button>
          </div>
          <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface-darker/40">
                  {fileIcon(file.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-text-primary">{file.name}</p>
                    <p className="text-xs truncate text-text-dim">{file.path}</p>
                    {file.gameName && (
                      <p className="text-xs text-accent font-medium mt-0.5">{file.gameName} · {file.appId}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {file.status === 'pending' && (
                      <span className="flex items-center gap-1 text-xs text-text-dim">
                        <Loader className="w-3 h-3 animate-spin" /> {t('addgame.importing')}
                      </span>
                    )}
                    {file.status === 'awaiting-confirm' && (
                      <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <AlertCircle className="w-3 h-3" /> Awaiting confirmation
                      </span>
                    )}
                    {file.status === 'imported' && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" /> {file.message}
                      </span>
                    )}
                    {file.status === 'rejected' && (
                      <span className="flex items-center gap-1 text-xs text-text-dim">
                        <X className="w-3 h-3" /> {file.message}
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <AlertCircle className="w-3 h-3" /> {file.message}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          {files.some((f) => f.status === 'imported') && (
            <Button variant="primary" icon={Power} className="mt-4 w-full justify-center" onClick={handleRestartSteam}>
              {t('addgame.restartToApply')}
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}

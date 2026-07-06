import { useState, useEffect, useCallback } from 'react'
import {
  FileCode,
  Search,
  Trash2,
  Edit3,
  Download,
  Copy,
  CheckCircle,
  RefreshCw,
  Terminal,
  Upload,
  Loader,
  Key,
  Package,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import type { LuaScriptEntry } from '../domain/types'

export default function LuaScripts() {
  const [search, setSearch] = useState('')
  const [scripts, setScripts] = useState<LuaScriptEntry[]>([])
  const [selectedScript, setSelectedScript] = useState<LuaScriptEntry | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPath, setImportPath] = useState('')
  const { showToast } = useToastStore()

  const loadScripts = useCallback(async () => {
    setLoading(true)
    const result = await window.steamtools.listLuaScripts()
    if (result.success) {
      setScripts(result.scripts)
      if (result.scripts.length > 0 && !selectedScript) {
        setSelectedScript(result.scripts[0])
        setCode(result.scripts[0].content)
      }
    }
    setLoading(false)
  }, [selectedScript])

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  const filteredScripts = scripts.filter((s) =>
    s.fileName.toLowerCase().includes(search.toLowerCase()) ||
    s.parsed.appIds.some((a) => a.id.includes(search))
  )

  const handleSelectScript = (script: LuaScriptEntry) => {
    setSelectedScript(script)
    setCode(script.content)
    setShowEditor(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async (fileName: string) => {
    const result = await window.steamtools.deleteLuaScript(fileName)
    if (result.success) {
      showToast('success', result.message || t('luascripts.scriptDeleted'))
      if (selectedScript?.fileName === fileName) {
        setSelectedScript(null)
        setCode('')
      }
      await loadScripts()
    } else {
      showToast('error', result.error || t('luascripts.deleteFailed'))
    }
  }

  const handleImport = async () => {
    if (!importPath.trim()) {
      showToast('error', t('luascripts.enterFilePath'))
      return
    }

    setImporting(true)
    const result = await window.steamtools.importLuaScript({ luaPath: importPath.trim() })
    if (result.success) {
      showToast('success', result.message || t('luascripts.scriptImported'))
      setShowImportModal(false)
      setImportPath('')
      await loadScripts()
    } else {
      showToast('error', result.error || t('luascripts.importFailed'))
    }
    setImporting(false)
  }

  return (
    <div data-section="Lua Scripts" className="space-y-4 animate-fade-in p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-bright">{t('luascripts.title')}</h2>
          <p className="text-xs mt-0.5 text-text-dim">{t('luascripts.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadScripts}>
            {t('common.refresh')}
          </Button>
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => setShowImportModal(true)}>
            {t('luascripts.importScript')}
          </Button>
        </div>
      </div>

      <Card className="border-accent/30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">{t('luascripts.scriptingEngine')}</p>
            <p className="text-xs text-text-dim mt-0.5">
              {t('luascripts.scriptingDesc')}
            </p>
          </div>
        </div>
      </Card>

      <Modal open={showImportModal} onClose={() => setShowImportModal(false)} title={t('luascripts.importScript')} width="400px">
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-text-primary block mb-2">{t('luascripts.filePathRequired')}</label>
            <Input
              type="text"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              placeholder="C:\Users\...\2406770.lua"
              autoFocus
              className="w-full"
            />
            <p className="text-xs text-text-dim mt-1">{t('luascripts.filePathHint')}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowImportModal(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              icon={Download}
              className="flex-1"
              onClick={handleImport}
              disabled={importing || !importPath.trim()}
              loading={importing}
            >
              {importing ? t('common.importing') : t('common.import')}
            </Button>
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-bright">{t('luascripts.installedScripts')}</h3>
            <span className="text-xs text-text-dim">{filteredScripts.length} {t('luascripts.scriptsCount')}</span>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('luascripts.searchScripts')}
              className="w-full bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-5 h-5 text-accent animate-spin" />
            </div>
          ) : filteredScripts.length === 0 ? (
            <div className="text-center py-8">
              <FileCode className="w-8 h-8 text-text-dim mx-auto mb-2" />
              <p className="text-xs text-text-dim">{t('luascripts.noScriptsFound')}</p>
              <p className="text-xs text-text-dim mt-1">{t('luascripts.importToStart')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredScripts.map((script) => (
                <div
                  key={script.fileName}
                  onClick={() => handleSelectScript(script)}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    selectedScript?.fileName === script.fileName
                      ? 'bg-accent/10 border-accent/50'
                      : 'bg-surface-darker/40 border-border hover:border-border-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="w-4 h-4 text-accent" />
                    <span className="text-xs font-medium text-text-primary truncate">{script.fileName}</span>
                  </div>
                  {script.parsed.appIds.length > 0 && (
                    <div className="flex items-center gap-2 mt-1 ml-6">
                      <span className="text-xs text-text-dim">{t('luascripts.appIds')}:</span>
                      {script.parsed.appIds.slice(0, 3).map((a, idx) => (
                        <span key={`${script.fileName}-${a.id}-${idx}`} className="text-xs text-accent font-mono">{a.id}</span>
                      ))}
                      {script.parsed.appIds.length > 3 && (
                        <span className="text-xs text-text-dim">+{script.parsed.appIds.length - 3}</span>
                      )}
                    </div>
                  )}
                  {script.parsed.manifestIds.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 ml-6">
                      <Package className="w-3 h-3 text-text-dim" />
                      <span className="text-xs text-text-dim">{script.parsed.manifestIds.length} {t('luascripts.manifests')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-2 card">
          {selectedScript ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileCode className="w-5 h-5 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold text-text-bright">{selectedScript.fileName}</h3>
                    <p className="text-xs text-text-dim">
                      {selectedScript.parsed.appIds.length} {t('luascripts.appIds')} - {selectedScript.parsed.manifestIds.length} {t('luascripts.manifestsCount')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopy} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                    {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? t('common.copied') : t('logs.copy')}
                  </button>
                  <button onClick={() => setShowEditor(!showEditor)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                    <Edit3 className="w-3 h-3" />
                    {showEditor ? t('luascripts.preview') : t('common.edit')}
                  </button>
                  <button onClick={() => handleDelete(selectedScript.fileName)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg p-3 border border-border bg-surface-darker/40">
                  <p className="text-xs text-text-dim mb-2">{t('luascripts.appIds')}</p>
                  <div className="space-y-1">
                    {selectedScript.parsed.appIds.map((a, idx) => (
                      <div key={`${selectedScript.fileName}-${a.id}-${idx}`} className="flex items-center gap-2 text-xs">
                        <span className="text-accent font-mono">{a.id}</span>
                        {a.key && (
                          <span className="flex items-center gap-1 text-yellow-400">
                            <Key className="w-2.5 h-2.5" />
                            {t('luascripts.hasKey')}
                          </span>
                        )}
                        {a.type !== undefined && a.type !== '' && (
                          <span className="text-text-dim">{t('luascripts.type')}: {a.type}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg p-3 border border-border bg-surface-darker/40">
                  <p className="text-xs text-text-dim mb-2">{t('luascripts.manifestIds')}</p>
                  <div className="space-y-1">
                    {selectedScript.parsed.manifestIds.length > 0 ? (
                      selectedScript.parsed.manifestIds.map((m, idx) => (
                        <div key={`${m.depotId}-${idx}`} className="flex items-center gap-2 text-xs">
                          <Package className="w-3 h-3 text-text-dim" />
                          <span className="text-text-primary font-mono">{m.depotId}</span>
                          <span className="text-text-dim">-&gt;</span>
                          <span className="text-accent font-mono">{m.manifestId}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-text-dim">{t('luascripts.noManifestIds')}</p>
                    )}
                  </div>
                </div>
              </div>

              {showEditor ? (
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-[400px] bg-surface-darker border border-border rounded-lg p-4 text-xs font-mono text-text-primary focus:outline-none focus:border-accent resize-none"
                  spellCheck={false}
                />
              ) : (
                <div className="rounded-lg p-4 h-[400px] overflow-auto bg-surface-darker border border-border">
                  <pre className="text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap">{code}</pre>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-[500px]">
              <div className="text-center">
                <FileCode className="w-12 h-12 text-text-dim mx-auto mb-3" />
                <p className="text-sm text-text-dim">{t('luascripts.selectScript')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

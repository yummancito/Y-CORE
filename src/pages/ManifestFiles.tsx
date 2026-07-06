import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Package,
  Upload,
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Boxes,
  Loader,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { formatSize } from '../domain/utils'
import type { ManifestFileEntry } from '../domain/types'

export default function ManifestFiles() {
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [manifests, setManifests] = useState<ManifestFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importing, setImporting] = useState(false)
  const dropImportingRef = useRef(false)
  const { showToast } = useToastStore()

  const loadManifests = useCallback(async () => {
    setLoading(true)
    const result = await window.steamtools.listManifestFiles()
    if (result.success) {
      setManifests(result.manifests)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadManifests()
  }, [loadManifests])

  const filtered = manifests.filter(
    (m) => m.fileName.toLowerCase().includes(search.toLowerCase()) || m.depotId.includes(search)
  )

  const handleImport = async () => {
    if (!importPath.trim()) {
      showToast('error', t('manifests.enterFilePath'))
      return
    }
    setImporting(true)
    const result = await window.steamtools.importManifest({ manifestPath: importPath.trim() })
    if (result.success) {
      showToast('success', result.message || t('manifests.manifestImported'))
      setShowImportModal(false)
      setImportPath('')
      await loadManifests()
    } else {
      showToast('error', result.error || t('manifests.importFailed'))
    }
    setImporting(false)
  }

  const handleDelete = async (fileName: string) => {
    const result = await window.steamtools.deleteManifestFile(fileName)
    if (result.success) {
      showToast('success', result.message || t('manifests.manifestDeleted'))
      await loadManifests()
    } else {
      showToast('error', result.error || t('manifests.deleteFailed'))
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (dropImportingRef.current) return
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.manifest'))
    if (droppedFiles.length === 0) {
      showToast('info', t('manifests.noManifestsInDrop'))
      return
    }
    dropImportingRef.current = true
    try {
      for (const file of droppedFiles) {
        const filePath = await window.steamtools.getPathForFile(file)
        const result = await window.steamtools.importManifest({ manifestPath: filePath })
        if (result.success) {
          showToast('success', result.message || `Imported ${file.name}`)
        } else {
          showToast('error', result.error || `${t('manifests.importFailed')} ${file.name}`)
        }
      }
      await loadManifests()
    } catch (err: any) {
      showToast('error', err.message || t('manifests.dropImportFailed'))
    } finally {
      dropImportingRef.current = false
    }
  }, [loadManifests, showToast])

  return (
    <div data-section="Manifests" className="space-y-4 animate-fade-in p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-bright">{t('manifests.title')}</h2>
          <p className="text-xs mt-0.5 text-text-dim">{t('manifests.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadManifests}>
            {t('common.refresh')}
          </Button>
          <Button variant="primary" size="sm" icon={Upload} onClick={() => setShowImportModal(true)}>
            {t('manifests.importManifest')}
          </Button>
        </div>
      </div>

      {/* Import Modal */}
      <Modal open={showImportModal} onClose={() => setShowImportModal(false)} title={t('manifests.importManifest')} width="400px">
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-text-primary block mb-2">{t('manifests.filePathRequired')}</label>
            <Input
              type="text"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              placeholder="C:\Users\...\2406771_100473726127154370.manifest"
              autoFocus
              className="w-full"
            />
            <p className="text-xs text-text-dim mt-1">
              {t('manifests.filePathHint')}
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowImportModal(false)}>
              {t('common.cancel')}
            </Button>
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

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors text-center py-8 ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border'
        }`}
      >
        <Upload className="w-10 h-10 text-text-dim mx-auto mb-3" />
        <p className="text-sm text-text-primary font-medium">{t('manifests.dragDropHint')}</p>
        <p className="text-xs text-text-dim mt-1">
          {t('manifests.dragDropDesc')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-bright">{manifests.length}</p>
              <p className="text-xs text-text-dim">{t('manifests.totalManifests')}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Boxes className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-bright">
                {new Set(manifests.map((m) => m.depotId)).size}
              </p>
              <p className="text-xs text-text-dim">{t('manifests.uniqueDepots')}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-light/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-text-dim" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-bright">
                {formatSize(manifests.reduce((acc, m) => acc + m.size, 0))}
              </p>
              <p className="text-xs text-text-dim">{t('manifests.totalSize')}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Manifests table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-bright">{t('manifests.manifestLibrary')}</h3>
          <Input
            variant="search"
            placeholder={t('manifests.searchManifests')}
            value={search}
            onClear={() => setSearch('')}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
        </div>

        {loading ? (
          <LoadingState message={t('manifests.loadingManifests')} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={manifests.length === 0 ? t('manifests.noManifestsFound') : t('manifests.noManifestsMatch')}
            description={manifests.length === 0 ? t('manifests.noManifestsFound') : t('manifests.tryDifferentSearch')}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-text-dim pb-3">{t('manifests.fileName')}</th>
                <th className="text-left text-xs font-medium text-text-dim pb-3">{t('manifests.depotId')}</th>
                <th className="text-left text-xs font-medium text-text-dim pb-3">{t('manifests.manifestId')}</th>
                <th className="text-left text-xs font-medium text-text-dim pb-3">{t('manifests.size')}</th>
                <th className="text-right text-xs font-medium text-text-dim pb-3">{t('manifests.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((manifest) => (
                <tr key={manifest.fileName} className="border-b border-border/50 hover:bg-surface-light/20 transition-colors">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-light/30 flex items-center justify-center">
                        <Package className="w-4 h-4 text-text-dim" />
                      </div>
                      <span className="text-sm font-medium text-text-primary font-mono">{manifest.fileName}</span>
                    </div>
                  </td>
                  <td className="py-3 text-xs text-accent font-mono">{manifest.depotId}</td>
                  <td className="py-3 text-xs text-text-dim font-mono">{manifest.manifestId}</td>
                  <td className="py-3 text-xs text-text-dim">{formatSize(manifest.size)}</td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleDelete(manifest.fileName)}
                      className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

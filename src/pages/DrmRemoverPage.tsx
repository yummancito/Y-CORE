import { useState, useEffect } from 'react'
import { ShieldOff, Search, Loader2, CheckCircle2, XCircle, AlertTriangle, Gamepad2, Info, ShieldAlert, Users } from 'lucide-react'
import { t, tf } from '../lib/i18n'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useToastStore } from '../stores/useToastStore'
import { usePageHeader } from '../components/layout/AppShell'
import { getCoverUrl } from '../domain/utils'
import { CoverImage } from '../components/ui/CoverImage'
import { Card3D } from '../components/ui/Card3D'
import { Modal } from '../components/ui/Modal'
import { drmService } from '../services/drm.service'
import type { DrmServiceContract } from '../../electron/common/ipc-contract'

type DrmAssessment = Awaited<ReturnType<DrmServiceContract['assessGameAdvanced']>>

type DrmStatus = 'idle' | 'checking' | 'processing' | 'success' | 'no-drm' | 'error' | 'already-removed'

interface GameDrmState {
  status: DrmStatus
  message?: string
}

export default function DrmRemoverPage() {
  const { games, loadGames, loading } = useLibraryStore()
  const { showToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [drmStates, setDrmStates] = useState<Record<string, GameDrmState>>({})
  const [assessmentModal, setAssessmentModal] = useState<{
    appId: string
    name: string
    loading: boolean
    data: DrmAssessment | null
  } | null>(null)

  usePageHeader(
    <div className="flex items-center w-full h-11">
      <div className="flex items-center gap-4 h-full flex-shrink-0">
        <h1 className="text-xl font-bold text-text-bright leading-none">{t('drm.title')}</h1>
      </div>
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="group flex items-center h-full relative w-64">
          <div className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center pointer-events-none z-10">
            <Search className="w-[18px] h-[18px] text-text-secondary transition-colors group-focus-within:text-text-bright" />
          </div>
          <input
            type="search"
            placeholder={t('library.searchGames')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-full pl-10 pr-4 rounded-lg bg-white/[0.06] border border-white/[0.08] outline-none text-sm text-text-bright placeholder:text-text-secondary transition-all hover:bg-white/[0.10] focus:bg-white/[0.10] focus:border-white/[0.16]"
          />
        </div>
      </div>
    </div>,
    [searchQuery]
  )
  const [coverErrors, setCoverErrors] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadGames()
  }, [loadGames])

  useEffect(() => {
    if (games.length === 0) return
    games.forEach((game) => {
      setDrmStates((prev) => ({ ...prev, [game.appId]: { status: 'idle' } }))
    })
  }, [games])

  const filtered = games.filter((g) =>
    (g.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.appId.includes(searchQuery)
  )

  const handleRemoveDrm = async (appId: string, name: string) => {
    const displayName = name || `App ${appId}`
    const confirmed = window.confirm(`${t('drm.confirmTitle')}\n\n${t('drm.confirmMessage')}\n\n${displayName} (${appId})`)
    if (!confirmed) return

    setDrmStates((prev) => ({ ...prev, [appId]: { status: 'processing' } }))

    try {
      const result = await window.steamtools.removeDrm(appId)
      if (result.success) {
        if (result.hadDrm) {
          setDrmStates((prev) => ({ ...prev, [appId]: { status: 'success', message: t('drm.success') } }))
          showToast('success', `${t('drm.success')} — ${displayName}`)
        } else {
          setDrmStates((prev) => ({ ...prev, [appId]: { status: 'no-drm', message: t('drm.noDrm') } }))
          showToast('info', `${t('drm.noDrm')} — ${displayName}`)
        }
      } else {
        const errorMessage = (result as any).errorKey ? t((result as any).errorKey) : result.message
        setDrmStates((prev) => ({ ...prev, [appId]: { status: 'error', message: errorMessage } }))
        showToast('error', `${t('drm.error')} — ${errorMessage}`)
      }
    } catch (err: any) {
      const errorMessage = err.message || t('drm.error')
      setDrmStates((prev) => ({ ...prev, [appId]: { status: 'error', message: errorMessage } }))
      showToast('error', `${t('drm.error')} — ${errorMessage}`)
    }
  }

  const onCoverError = (appId: string) => {
    setCoverErrors((prev) => new Set(prev).add(appId))
  }

  const openAssessment = async (appId: string, name: string) => {
    const displayName = name || `App ${appId}`
    setAssessmentModal({ appId, name: displayName, loading: true, data: null })
    try {
      const data = await drmService.assessGameAdvanced(appId)
      setAssessmentModal({ appId, name: displayName, loading: false, data })
    } catch {
      setAssessmentModal({ appId, name: displayName, loading: false, data: { success: false, appId } })
    }
  }

  const contributeAssessmentResult = async (status: 'success' | 'partial' | 'failed') => {
    if (!assessmentModal?.data?.drmDetection) return
    const { appId, data } = assessmentModal
    try {
      await drmService.contributeResult(
        appId,
        data.drmDetection!.drmType,
        'steamless',
        status,
      )
      showToast('success', t('drm.assess.contributeSuccess'))
      // Refresh stats after contributing
      const stats = await drmService.getCommunityStats(appId)
      setAssessmentModal((prev) => (prev ? { ...prev, data: prev.data ? { ...prev.data, communityStats: stats } : prev.data } : prev))
    } catch {
      showToast('error', t('drm.assess.contributeError'))
    }
  }

  const renderStatusBadge = (appId: string) => {
    const state = drmStates[appId]
    if (!state || state.status === 'idle') return null

    const drmType = (state as any).drmType
    const riskLevel = (state as any).riskLevel

    // DRM type badge
    const drmBadge = drmType && (
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
          riskLevel === 'critical'
            ? 'bg-red-500/20 text-red-400'
            : riskLevel === 'high'
            ? 'bg-orange-500/20 text-orange-400'
            : riskLevel === 'medium'
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-green-500/20 text-green-400'
        }`}
      >
        {drmType}
      </div>
    )

    switch (state.status) {
      case 'processing':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('drm.removing')}
          </div>
        )
      case 'success':
      case 'already-removed':
        return drmBadge || (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('drm.alreadyRemoved')}
          </div>
        )
      case 'no-drm':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-500/20 text-gray-400 text-xs font-medium">
            <XCircle className="w-3.5 h-3.5" />
            {t('drm.noDrm')}
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('drm.error')}
          </div>
        )
      default:
        return drmBadge
    }
  }

  return (
    <div data-section="DRM Remover" className="min-h-full overflow-y-auto animate-fade-in">
      <div className="px-6 py-6">
        {/* Info banner */}
        <div className="mb-6 p-4 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <div className="flex items-start gap-3">
            <ShieldOff className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-text-bright font-medium">{t('drm.description')}</p>
              <p className="text-xs text-text-muted mt-1">{t('drm.descriptionSub')}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <Loader2 className="w-8 h-8 mb-4 animate-spin text-accent" />
            <p className="text-sm">Cargando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <Gamepad2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-sm">{t('drm.noGames')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {filtered.map((game) => {
              const state = drmStates[game.appId]
              const isProcessing = state?.status === 'processing'
              const isDone = state?.status === 'success' || state?.status === 'already-removed' || state?.status === 'no-drm'
              return (
                <Card3D key={game.appId} className="group/card cursor-pointer">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300 shadow-card hover:shadow-card-hover">
                    <CoverImage
                      src={getCoverUrl(game.appId)}
                      fallbackSrc={`https://depotbox.org/api/images/steam-header/${game.appId}`}
                      alt={game.name}
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                    <div className="absolute bottom-0 left-0 right-0 p-3 pt-8 z-10">
                      <p className="text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                        {game.name || `App ${game.appId}`}
                      </p>
                      <p className="text-[10px] text-white/60 font-mono mt-0.5">AppID {game.appId}</p>
                    </div>

                    {/* Status badge */}
                    <div className="absolute top-2 right-2 z-10">
                      {renderStatusBadge(game.appId)}
                    </div>

                    {/* Hover actions */}
                    <div
                      className="absolute inset-0 z-20 flex flex-col justify-end gap-2 opacity-0 group-hover/card:opacity-100 transition-all duration-300 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        disabled={isProcessing || isDone}
                        className={`pointer-events-auto flex items-center justify-center gap-2 mx-3 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${
                          isDone
                            ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                            : isProcessing
                            ? 'bg-blue-500/50 text-blue-200 cursor-wait'
                            : 'bg-accent text-black hover:bg-accent-hover shadow-accent/25'
                        }`}
                        onClick={(e) => { e.stopPropagation(); handleRemoveDrm(game.appId, game.name) }}
                      >
                        {isProcessing ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <ShieldOff className="w-5 h-5" />
                        )}
                        {isDone ? t('drm.alreadyRemoved') : t('drm.removeButton')}
                      </button>
                      <button
                        className="pointer-events-auto flex items-center justify-center gap-2 mx-3 mb-4 px-5 py-2 rounded-xl text-xs font-medium transition-all bg-white/10 text-white hover:bg-white/20"
                        onClick={(e) => { e.stopPropagation(); openAssessment(game.appId, game.name) }}
                      >
                        <Info className="w-4 h-4" />
                        {t('drm.assess.viewDetails')}
                      </button>
                    </div>
                  </div>
                </Card3D>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        open={assessmentModal !== null}
        onClose={() => setAssessmentModal(null)}
        title={assessmentModal ? `${t('drm.assess.title')} — ${assessmentModal.name}` : undefined}
        width="480px"
      >
        {assessmentModal && (
          <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {assessmentModal.loading ? (
              <div className="flex items-center justify-center py-10 text-text-dim gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">{t('drm.assess.loading')}</span>
              </div>
            ) : !assessmentModal.data?.success ? (
              <div className="flex items-center gap-2 text-sm text-red-400 py-6 justify-center">
                <AlertTriangle className="w-5 h-5" />
                {t('drm.assess.error')}
              </div>
            ) : (
              <>
                {/* ML signature detection */}
                <div>
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
                    <ShieldOff className="w-3.5 h-3.5" />
                    {t('drm.assess.mlSection')}
                  </div>
                  {assessmentModal.data.drmDetection?.detected ? (
                    <div className="space-y-1">
                      <p className="text-sm text-text-bright">
                        {tf('drm.assess.mlDetected', {
                          type: assessmentModal.data.drmDetection.drmType,
                          confidence: Math.round(assessmentModal.data.drmDetection.confidence * 100),
                        })}
                      </p>
                      {assessmentModal.data.drmDetection.recommendations.map((rec, i) => (
                        <p key={i} className="text-xs text-text-muted">{rec}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">{t('drm.assess.mlNotDetected')}</p>
                  )}
                </div>

                {/* Anti-cheat */}
                <div>
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {t('drm.assess.antiCheatSection')}
                  </div>
                  {assessmentModal.data.antiCheatDetection?.detected ? (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-1">
                      <p className="text-sm text-red-400 font-medium">
                        {tf('drm.assess.antiCheatDetected', { type: assessmentModal.data.antiCheatDetection.antiCheatType })}
                      </p>
                      {assessmentModal.data.antiCheatDetection.kernelMode && (
                        <p className="text-xs text-red-300">{t('drm.assess.antiCheatKernel')}</p>
                      )}
                      {assessmentModal.data.antiCheatDetection.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-text-muted">{w}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">{t('drm.assess.antiCheatNone')}</p>
                  )}
                </div>

                {/* Community (local) stats */}
                <div>
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
                    <Users className="w-3.5 h-3.5" />
                    {t('drm.assess.communitySection')}
                  </div>
                  <p className="text-[11px] text-text-dim mb-2">{t('drm.assess.communityNote')}</p>
                  {assessmentModal.data.communityStats ? (
                    <div className="space-y-1">
                      <p className="text-sm text-text-bright">
                        {tf('drm.assess.communityReports', { count: assessmentModal.data.communityStats.totalReports })}
                      </p>
                      <p className="text-xs text-text-muted">
                        {tf('drm.assess.communitySuccessRate', { rate: assessmentModal.data.communityStats.successRate })}
                      </p>
                      <p className="text-xs text-text-muted">
                        {tf('drm.assess.communityPreferredMethod', { method: assessmentModal.data.communityStats.preferredMethod })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">{t('drm.assess.communityNoData')}</p>
                  )}

                  {assessmentModal.data.drmDetection?.detected && (
                    <div className="flex gap-2 mt-3">
                      <button
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                        onClick={() => contributeAssessmentResult('success')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('drm.assess.contributeButton')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Film, Play, Trash2 } from 'lucide-react'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import { useToastStore } from '../stores/useToastStore'
import { posterUrl } from '../lib/tmdb'
import type { HistoryEntry } from '../types/media'

type GroupKey = 'Hoy' | 'Ayer' | 'Esta semana' | 'Anterior'

function groupByDate(entries: HistoryEntry[]): [GroupKey, HistoryEntry[]][] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const startOfWeek = startOfToday - 6 * 86400000

  const groups: Record<GroupKey, HistoryEntry[]> = {
    Hoy: [],
    Ayer: [],
    'Esta semana': [],
    Anterior: [],
  }

  for (const e of entries) {
    if (e.watchedAt >= startOfToday) groups['Hoy'].push(e)
    else if (e.watchedAt >= startOfYesterday) groups['Ayer'].push(e)
    else if (e.watchedAt >= startOfWeek) groups['Esta semana'].push(e)
    else groups['Anterior'].push(e)
  }

  return (Object.entries(groups) as [GroupKey, HistoryEntry[]][]).filter(
    ([, items]) => items.length > 0
  )
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.push)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    window.api.history
      .get()
      .then((h) => setHistory([...h].sort((a, b) => b.watchedAt - a.watchedAt)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => groupByDate(history), [history])

  async function handleClear() {
    try {
      await window.api.history.clear()
      setHistory([])
      setConfirmOpen(false)
      pushToast('Historial limpiado', 'success')
    } catch {
      pushToast('No se pudo limpiar el historial', 'error')
    }
  }

  return (
    <div className="px-10 lg:px-14 pt-28 pb-16 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1
          className="text-4xl font-extrabold tracking-[-0.02em] text-white"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Historial
        </h1>
        {history.length > 0 && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold text-text-secondary bg-white/[0.04] border border-white/[0.09] hover:text-red-400 hover:border-red-400/40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar historial
          </button>
        )}
      </div>

      <div className="mt-8 max-w-[860px]">
        {loading ? (
          <LoadingState variant="spinner" message="Cargando historial..." />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Tu historial está vacío"
            description="Lo que empieces a ver va a aparecer acá para que puedas retomarlo."
            action={
              <button className="btn-primary" onClick={() => navigate('/home')}>
                Explorar
              </button>
            }
          />
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="mb-9">
              <h2 className="text-[11px] font-bold tracking-[1.5px] text-text-dim uppercase mb-3">
                {label}
              </h2>
              <div className="flex flex-col gap-2">
                {items.map((entry, i) => {
                  const pct = Math.min(100, Math.max(0, Math.round(entry.progress * 100)))
                  return (
                    <motion.div
                      key={`${entry.mediaType}-${entry.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      onClick={() => navigate(`/detail/${entry.mediaType}/${entry.id}`)}
                      className="flex items-center gap-4 p-3 rounded-2xl bg-surface-1 border border-white/[0.05] hover:border-white/[0.12] hover:bg-surface-2 transition-all duration-200 cursor-pointer group"
                    >
                      <div className="w-[52px] h-[78px] rounded-lg overflow-hidden bg-surface-2 flex-none flex items-center justify-center">
                        {entry.posterPath ? (
                          <img
                            src={posterUrl(entry.posterPath, 'w342') || ''}
                            alt={entry.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Film className="w-5 h-5 text-text-dim" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[14.5px] font-semibold text-white truncate">
                          {entry.title}
                        </p>
                        <p className="text-[11.5px] text-text-dim mt-0.5 uppercase tracking-wide">
                          {entry.mediaType === 'tv' ? 'Serie' : 'Película'} · {pct}% visto
                        </p>
                        <div className="h-1 rounded-full bg-white/[0.08] mt-2.5 max-w-[280px]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: 'linear-gradient(90deg, #6C63FF, #3BB2F7)',
                            }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/watch/${entry.mediaType}/${entry.id}`)
                        }}
                        className="flex-none flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-bold text-white bg-white/[0.06] border border-white/[0.1] opacity-0 group-hover:opacity-100 hover:bg-accent hover:border-accent transition-all duration-200"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        Continuar
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Confirm limpiar historial */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70"
            style={{ backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              className="glass-strong rounded-2xl p-6 w-[380px] max-w-[90vw]"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-white">¿Limpiar historial?</h3>
              <p className="text-sm text-text-secondary mt-2">
                Se va a borrar todo tu historial de reproducción, incluido el progreso de "Seguir
                viendo". Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="h-10 px-5 rounded-xl text-sm font-semibold text-text-secondary hover:text-white bg-white/[0.05] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClear}
                  className="h-10 px-5 rounded-xl text-sm font-bold text-white bg-red-500/90 hover:bg-red-500 transition-colors"
                >
                  Limpiar todo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Check, Loader2 } from 'lucide-react'
import { useTourStore, type TourStep } from '../../stores/useTourStore'
import { Ghost } from '../Ghost'
import { t } from '../../lib/i18n'
import { playPopSound, playCompleteSound } from '../../lib/tour-sounds'

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'body',
    titleKey: 'tour.welcome.title',
    descriptionKey: 'tour.welcome.desc',
    placement: 'bottom',
  },
  {
    id: 'library',
    target: '[data-tour="library"]',
    titleKey: 'tour.library.title',
    descriptionKey: 'tour.library.desc',
    placement: 'right',
  },
  {
    id: 'store',
    target: '[data-tour="store"]',
    titleKey: 'tour.store.title',
    descriptionKey: 'tour.store.desc',
    placement: 'right',
  },
  {
    id: 'onlinefix',
    target: '[data-tour="onlinefix"]',
    titleKey: 'tour.onlinefix.title',
    descriptionKey: 'tour.onlinefix.desc',
    placement: 'right',
  },
  {
    id: 'drmremover',
    target: '[data-tour="drmremover"]',
    titleKey: 'tour.drmremover.title',
    descriptionKey: 'tour.drmremover.desc',
    placement: 'right',
  },
  {
    id: 'logs',
    target: '[data-tour="logs"]',
    titleKey: 'tour.logs.title',
    descriptionKey: 'tour.logs.desc',
    placement: 'right',
  },
  {
    id: 'settings',
    target: '[data-tour="settings"]',
    titleKey: 'tour.settings.title',
    descriptionKey: 'tour.settings.desc',
    placement: 'right',
  },
  {
    id: 'steampath',
    target: '[data-tour="steampath"]',
    titleKey: 'tour.steampath.title',
    descriptionKey: 'tour.steampath.desc',
    placement: 'right',
  },
  {
    id: 'finish',
    target: 'body',
    titleKey: 'tour.finish.title',
    descriptionKey: 'tour.finish.desc',
    placement: 'bottom',
  },
]

const ROUTE_MAP: Record<string, string> = {
  library: '/',
  store: '/store',
  onlinefix: '/online-fix',
  drmremover: '/drm-remover',
  logs: '/logs',
  settings: '/settings',
  steampath: '/settings',
}

function ghostExpression(stepId: string): 'neutral' | 'happy' | 'wink' | 'surprise' {
  if (stepId === 'welcome') return 'happy'
  if (stepId === 'finish') return 'wink'
  if (stepId === 'store') return 'surprise'
  return 'neutral'
}

function TourOverlayInner() {
  const { isOpen, currentStep, steps, next, prev, close, start } = useTourStore()
  const [animDir, setAnimDir] = useState<'left' | 'right'>('right')
  const [lastStep, setLastStep] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        handleNext()
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        handlePrev()
      }
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, currentStep])

  useEffect(() => {
    const dir = currentStep > lastStep ? 'right' : 'left'
    setAnimDir(dir)
    setLastStep(currentStep)
  }, [currentStep])

  const log = useCallback((msg: string) => {
    window.steamtools?.addLog?.({ level: 'INFO', message: `[Tour] ${msg}` })?.catch?.(() => {})
  }, [])

  const handleNext = useCallback(() => {
    const cs = currentStep
    const st = steps
    if (st[cs]) {
      log(`Navigating from ${st[cs].id} to ${st[cs + 1]?.id || 'end'}`)
    }
    if (cs < st.length - 1) {
      const nextStep = st[cs + 1]
      if (nextStep && nextStep.target !== 'body') {
        // Navegación REAL con React Router
        const route = ROUTE_MAP[nextStep.id]
        if (route) navigate(route)
      }
    }
    if (cs === st.length - 1) {
      localStorage.setItem('y-core-tour-done', 'true')
      playCompleteSound()
      log('Tour completed')
    } else {
      playPopSound()
    }
    next()
  }, [currentStep, steps, next, navigate, log])

  const handlePrev = useCallback(() => {
    const cs = currentStep
    const st = steps
    if (cs > 0) {
      const prevStep = st[cs - 1]
      if (prevStep && prevStep.target !== 'body') {
        const route = ROUTE_MAP[prevStep.id]
        if (route) navigate(route)
      }
    }
    playPopSound()
    prev()
  }, [currentStep, steps, prev, navigate])

  const handleClose = useCallback(() => {
    localStorage.setItem('y-core-tour-done', 'true')
    playCompleteSound()
    log('Tour skipped')
    close()
  }, [close, log])

  useEffect(() => {
    if (!isOpen || steps.length === 0) return
    log(`Step ${currentStep + 1}/${steps.length}: ${steps[currentStep].id}`)
  }, [currentStep, isOpen, steps, log])

  useEffect(() => {
    const timer = setTimeout(() => {
      log('Starting tour (dev mode)')
      start(TOUR_STEPS)
    }, 2000)
    return () => clearTimeout(timer)
  }, [start, log])

  const step = steps[currentStep]
  if (!isOpen || !step) return null

  return (
    <TourUI
      step={step}
      currentStep={currentStep}
      totalSteps={steps.length}
      animDir={animDir}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={handleClose}
      isFirst={currentStep === 0}
      isLast={currentStep === steps.length - 1}
    />
  )
}

function TourUI({
  step,
  currentStep,
  totalSteps,
  animDir,
  onNext,
  onPrev,
  onClose,
  isFirst,
  isLast,
}: {
  step: TourStep
  currentStep: number
  totalSteps: number
  animDir: 'left' | 'right'
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [picking, setPicking] = useState(false)
  const [pickedPath, setPickedPath] = useState<string | null>(null)

  useEffect(() => {
    if (step.target === 'body') {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(step.target) as HTMLElement | null
    if (el) {
      setTargetRect(el.getBoundingClientRect())
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Efecto de enfoque mucho más fuerte: borde grueso, glow y escala
      el.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
      el.style.outline = '3px solid var(--accent, #6366f1)'
      el.style.outlineOffset = '4px'
      el.style.boxShadow = '0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2)'
      el.style.transform = 'scale(1.03)'
      el.style.zIndex = '9999'
    }
    const update = () => {
      const e2 = document.querySelector(step.target) as HTMLElement | null
      if (e2) setTargetRect(e2.getBoundingClientRect())
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      const el = document.querySelector(step.target) as HTMLElement | null
      if (el) {
        el.style.outline = ''
        el.style.outlineOffset = ''
        el.style.boxShadow = ''
        el.style.transform = ''
        el.style.zIndex = ''
      }
    }
  }, [step.target])

  // Load current Steam path when entering the steampath step
  useEffect(() => {
    if (step.id !== 'steampath') return
    window.steamtools?.getSteamPath?.().then((r) => {
      setPickedPath(r?.success && r.path ? r.path : null)
    }).catch(() => {})
  }, [step.id])

  const handlePickSteamFolder = async () => {
    setPicking(true)
    try {
      const r = await window.steamtools?.openSteamFolderDialog?.()
      if (r?.success && r.path) {
        setPickedPath(r.path)
        playPopSound()
      }
    } catch {}
    setPicking(false)
  }
  let bubbleX = 0
  let bubbleY = 0
  let bubblePlacement: 'right' | 'left' | 'bottom' | 'top' = 'right'
  let ghostX = 0
  let ghostY = 0
  let ghostAnchored = false
  const BUBBLE_W = 400
  const BUBBLE_H = 290
  const GAP = 20
  const GHOST_SIZE = 110

  if (step.target !== 'body' && targetRect) {
    const spaceRight = window.innerWidth - targetRect.right
    const spaceLeft = targetRect.left
    const spaceBottom = window.innerHeight - targetRect.bottom

    if (spaceRight > BUBBLE_W + GHOST_SIZE + 50) {
      bubblePlacement = 'right'
      bubbleX = targetRect.right + GAP
      bubbleY = Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - BUBBLE_H / 2, window.innerHeight - BUBBLE_H - 16))
      ghostX = bubbleX + BUBBLE_W - 24
      ghostY = bubbleY + BUBBLE_H - GHOST_SIZE + 36
    } else if (spaceLeft > BUBBLE_W + GHOST_SIZE + 50) {
      bubblePlacement = 'left'
      bubbleX = targetRect.left - BUBBLE_W - GAP
      bubbleY = Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - BUBBLE_H / 2, window.innerHeight - BUBBLE_H - 16))
      ghostX = bubbleX - GHOST_SIZE + 24
      ghostY = bubbleY + BUBBLE_H - GHOST_SIZE + 36
    } else if (spaceBottom > BUBBLE_H + GHOST_SIZE + 50) {
      bubblePlacement = 'bottom'
      bubbleX = Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 16))
      bubbleY = targetRect.bottom + GAP + GHOST_SIZE / 2
      ghostX = bubbleX + 16
      ghostY = targetRect.bottom + 10
    } else {
      bubblePlacement = 'top'
      bubbleX = Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 16))
      bubbleY = targetRect.top - BUBBLE_H - GAP - 10
      ghostX = bubbleX + 16
      ghostY = targetRect.top - GHOST_SIZE - GAP
    }
  } else {
    bubbleX = window.innerWidth / 2 - BUBBLE_W / 2
    bubbleY = window.innerHeight / 2 - BUBBLE_H / 2 - 30
    ghostX = window.innerWidth / 2 - GHOST_SIZE / 2
    ghostY = bubbleY - GHOST_SIZE + 30
    ghostAnchored = true
  }

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {/* Fondo oscuro NO BORROSO — el blur global hace ilegible la burbuja */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/75 pointer-events-auto"
        onClick={onClose}
      />

      {step.target !== 'body' && targetRect && (
        <>
          {/* Spotlight principal */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed pointer-events-none z-[9999]"
            style={{
              left: targetRect.left - 12,
              top: targetRect.top - 12,
              width: targetRect.width + 24,
              height: targetRect.height + 24,
              borderRadius: 14,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
              border: '3px solid var(--accent, #6366f1)',
              filter: 'drop-shadow(0 0 15px rgba(99,102,241,0.6))',
            }}
          />
          {/* Anillo pulsante */}
          <motion.div
            animate={{
              scale: [1, 1.06, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            className="fixed pointer-events-none z-[9999]"
            style={{
              left: targetRect.left - 16,
              top: targetRect.top - 16,
              width: targetRect.width + 32,
              height: targetRect.height + 32,
              borderRadius: 18,
              border: '2px solid var(--accent, #6366f1)',
              boxShadow: '0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(99,102,241,0.2)',
            }}
          />
          {/* Fondo brilloso */}
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.08, 0.15, 0.08],
            }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="fixed pointer-events-none z-[9998]"
            style={{
              left: targetRect.left - 6,
              top: targetRect.top - 6,
              width: targetRect.width + 12,
              height: targetRect.height + 12,
              borderRadius: 12,
              backgroundColor: 'var(--accent, #6366f1)',
            }}
          />
        </>
      )}

      <motion.div
        key={`ghost-${step.id}`}
        initial={{ scale: 0, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: [0, -14, 0] }}
        transition={{
          type: 'spring', stiffness: 200, damping: 14,
          y: { repeat: Infinity, duration: 3.5, ease: 'easeInOut' },
        }}
        className="fixed z-[9999] pointer-events-auto"
        style={{ left: ghostX, top: ghostY }}
      >
        <Ghost size={GHOST_SIZE} expression={ghostExpression(step.id)} className="text-accent drop-shadow-[0_0_50px_rgba(99,102,241,0.7)]" />
      </motion.div>

      <motion.div
        key={`bubble-${step.id}`}
        initial={{ opacity: 0, scale: 0.92, x: animDir === 'right' ? 30 : -30, y: 10 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, x: animDir === 'right' ? -30 : 30, y: 10 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        className="fixed z-[9999] pointer-events-auto"
        style={{ left: bubbleX, top: bubbleY, width: BUBBLE_W }}
      >
        <div
          className="relative rounded-2xl p-6 border border-white/10 shadow-2xl"
          style={{ background: 'var(--bg-secondary, #1a1a24)' }}
        >
          <div
            className="absolute w-4 h-4 rotate-45 border-l border-t border-white/10"
            style={{
              background: 'var(--bg-secondary, #1a1a24)',
              ...(ghostAnchored
                ? { left: BUBBLE_W / 2 - 8, top: -8 }
                : bubblePlacement === 'right'
                  ? { right: 20, bottom: 30 }
                  : bubblePlacement === 'left'
                    ? { left: -8, top: 100 }
                    : bubblePlacement === 'bottom'
                      ? { left: 40, top: -8 }
                      : { left: 40, bottom: -8 }),
            }}
          />

          <h2 className="text-xl font-bold text-text-bright mb-2">{t(step.titleKey)}</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-6">{t(step.descriptionKey)}</p>

          {step.id === 'steampath' && (
            <div className="mb-5 space-y-3">
              {pickedPath ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-green-400">{t('tour.steampath.detected')}</p>
                    <p className="text-text-dim font-mono truncate" title={pickedPath}>{pickedPath}</p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                  {t('tour.steampath.notDetected')}
                </div>
              )}
              <button
                onClick={handlePickSteamFolder}
                disabled={picking || !!pickedPath}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold shadow-lg shadow-accent/20"
              >
                {picking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                {pickedPath ? t('tour.steampath.saved') : t('tour.steampath.pickBtn')}
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 mb-5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep ? 'w-8 bg-accent shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'w-1.5 bg-white/15'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="text-xs font-medium text-text-secondary hover:text-text-bright transition-colors px-2 py-1"
            >
              {t('tour.skip')}
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={onPrev}
                  className="text-xs font-semibold px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-bright transition-all"
                >
                  {t('tour.back')}
                </button>
              )}
              <button
                onClick={onNext}
                className="text-xs font-bold px-5 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white transition-all shadow-lg shadow-accent/25"
              >
                {isLast ? t('tour.finishBtn') : t('tour.next')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export function TourOverlay() {
  return <TourOverlayInner />
}

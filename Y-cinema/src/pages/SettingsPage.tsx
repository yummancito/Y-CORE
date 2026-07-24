import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Languages, LogOut, RotateCcw, Subtitles, User } from 'lucide-react'
import LoadingState from '../components/common/LoadingState'
import { useToastStore } from '../stores/useToastStore'
import { useAuthStore } from '../stores/useAuthStore'

type AudioLang = 'latino' | 'castellano' | 'english' | 'japanese'
type SubLang = 'es' | 'en' | 'none'

const AUDIO_OPTIONS: { value: AudioLang; label: string }[] = [
  { value: 'latino', label: 'Español Latino' },
  { value: 'castellano', label: 'Español Castellano' },
  { value: 'english', label: 'Inglés' },
  { value: 'japanese', label: 'Japonés' },
]

const SUB_OPTIONS: { value: SubLang; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'none', label: 'Ninguno' },
]

interface Prefs {
  audio: AudioLang
  subtitles: SubLang
  fallbackAudio: AudioLang
  autoSubtitles: boolean
  remember: boolean
}

function OptionRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`h-9 px-4 rounded-full text-[13px] font-semibold transition-all duration-200 border ${
              active
                ? 'bg-accent/20 text-accent border-accent/50'
                : 'bg-white/[0.04] text-text-secondary border-white/[0.09] hover:text-white hover:border-white/[0.2]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-none ${
        checked ? 'bg-accent' : 'bg-white/[0.12]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.push)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [loading, setLoading] = useState(true)
  const session = useAuthStore((s) => s.session)
  const authLoading = useAuthStore((s) => s.loading)
  const initAuth = useAuthStore((s) => s.init)
  const signOut = useAuthStore((s) => s.signOut)

  useEffect(() => {
    window.api.language
      .get()
      .then((p) => setPrefs(p as Prefs))
      .catch(() => pushToast('No se pudieron cargar las preferencias', 'error'))
      .finally(() => setLoading(false))
    initAuth()
  }, [pushToast, initAuth])

  async function handleSignOut() {
    try {
      await signOut()
      pushToast('Sesión cerrada', 'success')
    } catch {
      pushToast('No se pudo cerrar sesión', 'error')
    }
  }

  async function update(patch: Partial<Prefs>) {
    if (!prefs) return
    const previous = prefs
    const optimistic = { ...prefs, ...patch }
    setPrefs(optimistic)
    try {
      const saved = await window.api.language.set(patch)
      setPrefs(saved as Prefs)
    } catch {
      // Sin este rollback, un fallo de persistencia (disco lleno, permisos)
      // dejaba la UI mostrando el valor nuevo indefinidamente aunque en
      // disco hubiera quedado el anterior — solo hasta recargar la página.
      setPrefs(previous)
      pushToast('No se pudo guardar la preferencia', 'error')
    }
  }

  async function handleReset() {
    try {
      const saved = await window.api.language.reset()
      setPrefs(saved as Prefs)
      pushToast('Preferencias restablecidas', 'success')
    } catch {
      pushToast('No se pudo restablecer', 'error')
    }
  }

  if (loading || !prefs) {
    return (
      <div className="px-10 lg:px-14 pt-28">
        <LoadingState variant="spinner" message="Cargando preferencias..." />
      </div>
    )
  }

  return (
    <motion.div
      className="px-10 lg:px-14 pt-28 pb-16 max-w-[720px] animate-fade-in"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1
        className="text-4xl font-extrabold tracking-[-0.02em] text-white"
        style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
      >
        Ajustes
      </h1>
      <p className="text-[13px] text-text-dim mt-2">Preferencias de idioma y subtítulos</p>

      {/* Cuenta — opcional, favoritos/historial siguen locales sin sesión */}
      <section className="mt-9">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-accent" />
          <h2 className="text-[15px] font-semibold text-white">Cuenta</h2>
        </div>
        {authLoading ? null : session ? (
          <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
            <p className="text-[14px] text-text-secondary">{session.user.email}</p>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold text-text-secondary bg-white/[0.04] border border-white/[0.09] hover:text-white transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar sesión
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold text-accent bg-accent/10 border border-accent/30 hover:bg-accent/20 transition-colors"
          >
            Iniciar sesión
          </button>
        )}
      </section>

      {/* Audio */}
      <section className="mt-9">
        <div className="flex items-center gap-2 mb-3">
          <Languages className="w-4 h-4 text-accent" />
          <h2 className="text-[15px] font-semibold text-white">Audio preferido</h2>
        </div>
        <OptionRow options={AUDIO_OPTIONS} value={prefs.audio} onChange={(v) => update({ audio: v })} />
        <p className="text-[12px] text-text-dim mt-3">
          Si no está disponible, se usará:{' '}
          <span className="text-text-secondary font-medium">
            {AUDIO_OPTIONS.find((o) => o.value === prefs.fallbackAudio)?.label}
          </span>
        </p>
      </section>

      {/* Subtítulos */}
      <section className="mt-9">
        <div className="flex items-center gap-2 mb-3">
          <Subtitles className="w-4 h-4 text-accent" />
          <h2 className="text-[15px] font-semibold text-white">Subtítulos</h2>
        </div>
        <OptionRow options={SUB_OPTIONS} value={prefs.subtitles} onChange={(v) => update({ subtitles: v })} />
      </section>

      {/* Opciones */}
      <section className="mt-9 space-y-1">
        <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
          <div>
            <p className="text-[14px] font-medium text-white">Subtítulos automáticos</p>
            <p className="text-[12px] text-text-dim mt-0.5">
              Activar el idioma preferido al iniciar la reproducción
            </p>
          </div>
          <Toggle checked={prefs.autoSubtitles} onChange={(v) => update({ autoSubtitles: v })} />
        </div>
        <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
          <div>
            <p className="text-[14px] font-medium text-white">Recordar preferencias</p>
            <p className="text-[12px] text-text-dim mt-0.5">
              Guardar estos ajustes entre sesiones
            </p>
          </div>
          <Toggle checked={prefs.remember} onChange={(v) => update({ remember: v })} />
        </div>
        {!prefs.remember && (
          <p className="text-[12px] text-amber-400/80 pt-1">
            Los cambios de audio y subtítulos de esta sesión no se guardarán al reiniciar la app.
          </p>
        )}
      </section>

      <div className="mt-8 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[12px] text-emerald-400/80">
          <Check className="w-3.5 h-3.5" />
          Se guarda automáticamente
        </div>
        <div className="flex-1" />
        <button
          onClick={handleReset}
          className="flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold text-text-secondary bg-white/[0.04] border border-white/[0.09] hover:text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restablecer
        </button>
      </div>
    </motion.div>
  )
}

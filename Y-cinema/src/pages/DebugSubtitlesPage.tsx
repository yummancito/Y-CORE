// Pantalla de diagnóstico TEMPORAL — /debug/subtitles
// Verifica el flujo completo de idiomas/subtítulos con contenido real.
// No es parte de la app final; sirve para validar la fase actual.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'

type SubtitleFindResult = Awaited<ReturnType<typeof window.api.subtitles.find>>
type LangPrefs = Awaited<ReturnType<typeof window.api.language.get>>
type OSStatus = Awaited<ReturnType<typeof window.api.subtitles.status>>

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/[0.05]">
      <span className="text-[12px] text-text-dim w-44 flex-none pt-0.5">{label}</span>
      <span className="text-[13px] text-white break-words min-w-0">{children}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-1 border border-white/[0.06] p-4">
      <h2 className="text-xs font-bold tracking-[1.5px] text-accent uppercase mb-2">{title}</h2>
      {children}
    </section>
  )
}

export default function DebugSubtitlesPage() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<LangPrefs | null>(null)
  const [osStatus, setOsStatus] = useState<OSStatus | null>(null)
  const [testTitle, setTestTitle] = useState('Inception')
  const [testYear, setTestYear] = useState('2010')
  const [findResult, setFindResult] = useState<SubtitleFindResult | null>(null)
  const [finding, setFinding] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStatic = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        window.api.language.get(),
        window.api.subtitles.status(),
      ])
      setPrefs(p)
      setOsStatus(s)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    loadStatic()
  }, [loadStatic])

  const runFind = useCallback(async () => {
    setFinding(true)
    setError(null)
    setFindResult(null)
    const t0 = performance.now()
    try {
      const res = await window.api.subtitles.find(testTitle, {
        year: parseInt(testYear) || undefined,
      })
      setFindResult(res)
      setElapsed(Math.round(performance.now() - t0))
    } catch (e) {
      setError(String(e))
    } finally {
      setFinding(false)
    }
  }, [testTitle, testYear])

  const selected =
    findResult && findResult.autoIndex != null ? findResult.tracks[findResult.autoIndex] : null

  return (
    <div className="px-10 lg:px-14 pt-28 pb-16 max-w-[820px] animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="w-4 h-4 text-amber-400" />
        <span className="text-[11px] font-bold tracking-wide text-amber-400 uppercase">
          Diagnóstico temporal
        </span>
      </div>
      <h1
        className="text-3xl font-extrabold tracking-[-0.02em] text-white"
        style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
      >
        Subtítulos e idioma
      </h1>
      <p className="text-[13px] text-text-dim mt-2">
        Ruta: <code className="text-text-secondary">/debug/subtitles</code> — verificación del flujo real.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* Preferencias actuales (language.get) */}
        <Section title="Preferencias actuales — language.get()">
          {prefs ? (
            <div>
              <Field label="Audio">{prefs.audio}</Field>
              <Field label="Audio fallback">{prefs.fallbackAudio}</Field>
              <Field label="Subtítulos">{prefs.subtitles}</Field>
              <Field label="Auto-subtítulos">{String(prefs.autoSubtitles)}</Field>
              <Field label="Recordar">{String(prefs.remember)}</Field>
            </div>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
          )}
        </Section>

        {/* Estado OpenSubtitles */}
        <Section title="Estado de OpenSubtitles">
          {osStatus ? (
            <div>
              <Field label="API key detectada">
                {osStatus.apiKeyDetected ? (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sí
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <XCircle className="w-3.5 h-3.5" /> No — configurá VITE_OPENSUBTITLES_API_KEY
                  </span>
                )}
              </Field>
              <Field label="Endpoint">
                <code className="text-[11px] text-text-secondary">{osStatus.endpoint}</code>
              </Field>
            </div>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
          )}
        </Section>

        {/* Prueba de subtitles.find */}
        <Section title="Prueba — subtitles.find()">
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <label className="text-[11px] text-text-dim block mb-1">Título</label>
              <input
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-white/[0.09] text-[13px] text-white outline-none focus:border-accent/50"
              />
            </div>
            <div className="w-24">
              <label className="text-[11px] text-text-dim block mb-1">Año</label>
              <input
                value={testYear}
                onChange={(e) => setTestYear(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-white/[0.09] text-[13px] text-white outline-none focus:border-accent/50"
              />
            </div>
            <button
              onClick={runFind}
              disabled={finding}
              className="h-9 px-4 rounded-lg text-[13px] font-bold text-white bg-accent hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
            >
              {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Buscar
            </button>
          </div>

          {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}

          {findResult && (
            <div>
              <Field label="Tiempo de búsqueda">{elapsed} ms</Field>
              <Field label="Idioma preferido">{findResult.preferredLang}</Field>
              <Field label="Auto activado">{String(findResult.autoEnabled)}</Field>
              <Field label="Pistas encontradas">{findResult.tracks.length}</Field>
              <Field label="Subtítulo seleccionado">
                {selected ? (
                  <span className="text-emerald-400">
                    {selected.name} · {selected.lang} · {selected.origin}
                  </span>
                ) : (
                  <span className="text-text-dim">ninguno (auto-selección no aplicó)</span>
                )}
              </Field>

              {/* Lista completa de pistas */}
              <div className="mt-3">
                <p className="text-[11px] text-text-dim mb-2">Lista completa de pistas:</p>
                {findResult.tracks.length === 0 ? (
                  <p className="text-[12px] text-text-dim">
                    Sin pistas. {osStatus?.apiKeyDetected ? 'Ninguna fuente devolvió resultados.' : 'Falta la API key de OpenSubtitles.'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {findResult.tracks.map((t, i) => (
                      <div
                        key={`${t.url}-${i}`}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] border ${
                          i === findResult.autoIndex
                            ? 'bg-accent/10 border-accent/40'
                            : 'bg-surface-2 border-white/[0.05]'
                        }`}
                      >
                        <span className="text-text-dim w-5">{i}</span>
                        <span className="text-white flex-1 truncate">{t.name}</span>
                        <span className="text-text-secondary">{t.lang}</span>
                        <span
                          className={`text-[9px] font-bold uppercase rounded px-1 py-[1px] ${
                            t.origin === 'local'
                              ? 'text-emerald-400 bg-emerald-400/10'
                              : 'text-sky-400 bg-sky-400/10'
                          }`}
                        >
                          {t.origin === 'local' ? 'Local' : 'OpenSubs'}
                        </span>
                        {t.preferred && <span className="text-accent text-[10px]">★ pref</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        <button
          onClick={() => navigate(-1)}
          className="btn-outline self-start"
        >
          Volver
        </button>
      </div>
    </div>
  )
}

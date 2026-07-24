export interface SubtitleTrack {
  name: string
  url: string
  lang: string
  /** origen de la pista: embebida del torrent u OpenSubtitles */
  origin?: 'local' | 'opensubtitles'
  /** true si coincide con el idioma preferido del usuario */
  preferred?: boolean
}

interface SubtitlesMenuProps {
  tracks: SubtitleTrack[]
  activeIndex: number | null
  onSelect: (index: number | null) => void
  /** Si OpenSubtitles tiene API key configurada */
  apiKeyDetected?: boolean
}

// Etiqueta de idioma legible desde el nombre/lang de la pista
const LANG_LABELS: Array<{ label: string; patterns: string[] }> = [
  { label: 'Español', patterns: ['spanish', 'español', 'espanol', 'castellano', 'latino', 'spa', 'es'] },
  { label: 'Inglés', patterns: ['english', 'ingles', 'inglés', 'eng', 'en'] },
  { label: 'Francés', patterns: ['french', 'français', 'francais', 'fra', 'fre', 'fr'] },
  { label: 'Alemán', patterns: ['german', 'deutsch', 'alemán', 'aleman', 'ger', 'deu', 'de'] },
  { label: 'Portugués', patterns: ['portuguese', 'português', 'portugues', 'por', 'pt', 'br'] },
  { label: 'Italiano', patterns: ['italian', 'italiano', 'ita', 'it'] },
  { label: 'Japonés', patterns: ['japanese', 'japonés', 'japones', 'jpn', 'jp'] },
]

function trackLabel(t: SubtitleTrack): string {
  const hay = `${t.lang} ${t.name}`.toLowerCase()
  for (const { label, patterns } of LANG_LABELS) {
    if (patterns.some((p) => hay.includes(p))) return label
  }
  return t.lang || t.name || 'Otro'
}

export default function SubtitlesMenu({ tracks, activeIndex, onSelect, apiKeyDetected }: SubtitlesMenuProps) {
  return (
    <>
      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-[1.5px] text-text-dim">
        SUBTÍTULOS
      </div>
      <button
        onClick={() => onSelect(null)}
        className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-lg text-[13px] transition-colors hover:bg-white/[0.07] ${
          activeIndex === null ? 'text-accent font-semibold' : 'text-zinc-300'
        }`}
      >
        Desactivados
        {activeIndex === null && <span className="text-accent">✓</span>}
      </button>
      {tracks.length === 0 ? (
        <div className="px-2.5 py-[7px]">
          <p className="text-[12px] text-text-dim">No hay pistas disponibles</p>
          {apiKeyDetected === false && (
            <p className="text-[10.5px] text-amber-400/70 mt-1 leading-relaxed">
              OPENSUBTITLES_API_KEY no configurada en .env.{' '}
              Los subtítulos automáticos requieren una API key gratuita.
            </p>
          )}
          {apiKeyDetected === true && (
            <p className="text-[10.5px] text-text-dim/60 mt-1 leading-relaxed">
              No se encontraron subtítulos para este contenido.
            </p>
          )}
        </div>
      ) : (
        tracks.map((t, i) => (
          <button
            key={`${t.url}-${i}`}
            onClick={() => onSelect(i)}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-[7px] rounded-lg text-[13px] transition-colors hover:bg-white/[0.07] ${
              activeIndex === i ? 'text-accent font-semibold' : 'text-zinc-300'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{trackLabel(t)}</span>
              {t.origin && (
                <span
                  className={`flex-none text-[8.5px] font-bold uppercase tracking-wide rounded px-1 py-[1px] ${
                    t.origin === 'local'
                      ? 'text-emerald-400 bg-emerald-400/10'
                      : 'text-sky-400 bg-sky-400/10'
                  }`}
                >
                  {t.origin === 'local' ? 'Local' : 'OpenSubs'}
                </span>
              )}
            </span>
            {activeIndex === i && <span className="text-accent flex-none">✓</span>}
          </button>
        ))
      )}
    </>
  )
}

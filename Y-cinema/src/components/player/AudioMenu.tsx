export interface AudioTrack {
  index: number
  codec: string
  language: string
  title?: string
}

interface AudioMenuProps {
  tracks: AudioTrack[]
  activeIndex: number
  onSelect: (index: number) => void
}

// Etiqueta de idioma legible
const LANG_LABELS: Array<{ label: string; patterns: string[] }> = [
  { label: 'Español Latino', patterns: ['latino', 'latin', 'lat', 'español latino', 'spa-lat', 'es-la', 'esp latino'] },
  { label: 'Español Castellano', patterns: ['castellano', 'españa', 'spain', 'cast', 'es-es', 'esp'] },
  { label: 'Español', patterns: ['spanish', 'español', 'espanol', 'spa', 'es'] },
  { label: 'Inglés', patterns: ['english', 'ingles', 'inglés', 'eng', 'en'] },
  { label: 'Japonés', patterns: ['japanese', 'japonés', 'japones', 'jpn', 'jp', '日本語'] },
  { label: 'Francés', patterns: ['french', 'français', 'francais', 'fra', 'fre', 'fr'] },
  { label: 'Alemán', patterns: ['german', 'deutsch', 'ger', 'deu', 'de'] },
  { label: 'Portugués', patterns: ['portuguese', 'português', 'portugues', 'por', 'pt', 'br'] },
  { label: 'Italiano', patterns: ['italian', 'italiano', 'ita', 'it'] },
]

function trackLabel(t: AudioTrack): string {
  const hay = `${t.language} ${t.title || ''}`.toLowerCase()
  for (const { label, patterns } of LANG_LABELS) {
    if (patterns.some((p) => hay.includes(p))) return label
  }
  if (t.language && t.language !== 'und') return t.language.toUpperCase()
  if (t.title) return t.title
  // Si no hay metadata de idioma, mostrar códec + número de pista
  if (t.codec && t.codec !== 'unknown') return `${t.codec.toUpperCase()} #${t.index + 1}`
  return `Pista ${t.index + 1}`
}

export default function AudioMenu({ tracks, activeIndex, onSelect }: AudioMenuProps) {
  return (
    <>
      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-[1.5px] text-text-dim">
        AUDIO
      </div>
      {tracks.length === 0 ? (
        <div className="px-2.5 py-[7px] text-[12px] text-text-dim">
          No hay pistas de audio detectadas
        </div>
      ) : (
        tracks.map((t, i) => {
          const label = trackLabel(t)
          return (
            <button
              key={t.index}
              onClick={() => onSelect(t.index)}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-[7px] rounded-lg text-[13px] transition-colors hover:bg-white/[0.07] ${
                activeIndex === t.index ? 'text-accent font-semibold' : 'text-zinc-300'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{label}</span>
                {t.codec && (
                  <span className="flex-none text-[8.5px] font-bold uppercase tracking-wide rounded px-1 py-[1px] text-text-dim bg-white/[0.06]">
                    {t.codec}
                  </span>
                )}
              </span>
              {activeIndex === t.index && <span className="text-accent flex-none">✓</span>}
            </button>
          )
        })
      )}
    </>
  )
}

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GameCard, getDefaultGameImageUrl, type MergedGame } from './GameCard'

export function SectionRow({
  title, icon: Icon, games, onInstall, installing, onSelect, isRecommended,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  games: MergedGame[]
  onInstall: (g: MergedGame) => void
  installing: string | null
  onSelect?: (g: MergedGame) => void
  isRecommended?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 4)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4)
  }

  const scroll = (dir: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.8, behavior: 'smooth' })
    }
  }

  useEffect(() => {
    updateScrollState()
  }, [games])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <Icon className="w-6 h-6 text-accent" />
          <h2 className="text-base font-bold text-text-bright">{title}</h2>
          <span className="text-xs text-text-dim">({games.length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scroll(-1)}
            disabled={!canScrollLeft}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-text-dim transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll(1)}
            disabled={!canScrollRight}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-text-dim transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-2.5 overflow-x-auto scroll-smooth pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {games.map((g) => (
          <div key={g.app_id} className="flex-shrink-0 w-[300px]">
            <GameCard game={g} src={getDefaultGameImageUrl(g)} onInstall={onInstall} installing={installing} onSelect={onSelect} isRecommended={isRecommended} />
          </div>
        ))}
      </div>
    </div>
  )
}

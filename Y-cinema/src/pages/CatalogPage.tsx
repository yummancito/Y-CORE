import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import MovieGrid from '../components/catalog/MovieGrid'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import type { Movie } from '../types/media'

// sort=trending/rating no existen en y-cinema-api (ver docs/ROADMAP.md
// de ese repo: Media.popularity es un único número acumulado, sin
// distinción de ventana temporal ni endpoint de "mejor calificada").
// popularity y recent sí son reales.
type SortMode = 'popularity' | 'recent'

const sortLabels: Record<SortMode, string> = {
  popularity: 'Popularidad',
  recent: 'Más reciente',
}

const pageTitles: Record<string, string> = {
  movie: 'Películas',
  tv: 'Series',
  anime: 'Anime',
}

const apiTypeByMediaType: Record<string, 'MOVIE' | 'SERIES' | 'ANIME'> = {
  movie: 'MOVIE',
  tv: 'SERIES',
  anime: 'ANIME',
}

interface ApiGenre {
  id: string
  slug: string
  name: string
}

export default function CatalogPage() {
  const { mediaType = 'movie' } = useParams<{ mediaType: string }>()
  const apiType = apiTypeByMediaType[mediaType] ?? 'MOVIE'

  const [items, setItems] = useState<Movie[]>([])
  const [genres, setGenres] = useState<ApiGenre[]>([])
  // La API solo filtra por UN slug de género a la vez (GET /media?genre=),
  // a diferencia del multi-select AND que había antes con TMDB.
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('popularity')
  const [sortOpen, setSortOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const pageRef = useRef(1)
  const exhaustedRef = useRef(false)
  const requestIdRef = useRef(0)

  const fetchPage = useCallback(
    async (page: number): Promise<Movie[]> => {
      const res = await window.api.catalogApi.list({
        type: apiType,
        sort,
        page,
        pageSize: 20,
        ...(selectedGenre ? { genre: selectedGenre } : {}),
      })
      if ((res?.totalPages || 1) <= page) exhaustedRef.current = true
      return res?.items || []
    },
    [apiType, sort, selectedGenre]
  )

  // Carga inicial / cambio de tipo, género o sort
  useEffect(() => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setItems([])
    pageRef.current = 1
    exhaustedRef.current = false

    fetchPage(1)
      .then((batch) => {
        if (requestIdRef.current !== reqId) return
        setItems(batch)
      })
      .catch((err) => {
        console.error('Catalog load failed', err)
        if (requestIdRef.current === reqId) setError('No pudimos cargar el catálogo')
      })
      .finally(() => {
        if (requestIdRef.current === reqId) setLoading(false)
      })
  }, [fetchPage, reloadToken])

  // Géneros disponibles para filtrar
  useEffect(() => {
    setSelectedGenre(null)
    window.api.catalogApi
      .getGenres()
      .then((list) => setGenres(list || []))
      .catch(() => {})
  }, [mediaType])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || exhaustedRef.current) return
    const reqId = requestIdRef.current
    setLoadingMore(true)
    try {
      const next = pageRef.current + 1
      const batch = await fetchPage(next)
      if (requestIdRef.current !== reqId) return
      pageRef.current = next
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...batch.filter((m) => !seen.has(m.id))]
      })
    } catch (err) {
      console.error('Load more failed', err)
    } finally {
      if (requestIdRef.current === reqId) setLoadingMore(false)
    }
  }, [fetchPage, loading, loadingMore])

  const sentinelRef = useInfiniteScroll(loadMore, !loading && !error)

  function selectGenre(slug: string) {
    setSelectedGenre((prev) => (prev === slug ? null : slug))
  }

  return (
    <div className="px-10 lg:px-14 pt-28 pb-16 animate-fade-in">
      <h1
        className="text-4xl font-extrabold tracking-[-0.02em] text-white"
        style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
      >
        {pageTitles[mediaType] || 'Catálogo'}
      </h1>

      {/* Barra de filtros */}
      <div className="flex items-start gap-3 mt-7 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {genres.map((g) => {
            const active = selectedGenre === g.slug
            return (
              <button
                key={g.id}
                onClick={() => selectGenre(g.slug)}
                className={`h-[31px] flex items-center gap-1.5 px-3.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                  active
                    ? 'bg-accent/20 text-accent border-accent/50'
                    : 'bg-white/[0.04] text-text-secondary border-white/[0.09] hover:text-white hover:border-white/[0.2]'
                }`}
              >
                {g.name}
                {active && <X className="w-3 h-3" />}
              </button>
            )
          })}
        </div>

        {/* Ordenar */}
        <div className="relative flex-none">
          <button
            onClick={() => setSortOpen((o) => !o)}
            className="h-[34px] flex items-center gap-2 px-4 rounded-full text-xs font-semibold text-text-secondary bg-white/[0.04] border border-white/[0.09] hover:text-white transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {sortLabels[sort]}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-10 z-30 w-48 glass-strong rounded-xl p-1.5 shadow-card animate-slide-up">
              {(Object.keys(sortLabels) as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setSort(mode)
                    setSortOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                    sort === mode ? 'text-accent font-semibold' : 'text-text-secondary hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {sortLabels[mode]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <LoadingState variant="grid" count={15} />
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-text-secondary">{error}</p>
            <button className="btn-primary" onClick={() => setReloadToken((t) => t + 1)}>
              Reintentar
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="Sin resultados con estos filtros"
            description="Probá quitando el filtro de género para ver más títulos."
            action={
              selectedGenre ? (
                <button className="btn-outline" onClick={() => setSelectedGenre(null)}>
                  Limpiar filtro
                </button>
              ) : undefined
            }
          />
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <MovieGrid movies={items} />
          </motion.div>
        )}

        {/* Centinela de scroll infinito */}
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}

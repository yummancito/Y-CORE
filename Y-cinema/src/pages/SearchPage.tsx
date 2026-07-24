import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, SearchX } from 'lucide-react'
import MovieGrid from '../components/catalog/MovieGrid'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import { useDebounce } from '../hooks/useDebounce'
import type { Movie } from '../types/media'

type Filter = 'all' | 'movie' | 'tv' | 'anime'

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'movie', label: 'Películas' },
  { key: 'tv', label: 'Series' },
  { key: 'anime', label: 'Anime' },
]

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [filter, setFilter] = useState<Filter>('all')
  const [results, setResults] = useState<Movie[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Búsqueda fuzzy sobre el índice de Meilisearch de y-cinema-api (título,
  // actores, estudios, género — con typo tolerance y sinónimos).
  useEffect(() => {
    const q = debouncedQuery.trim()
    setSearchParams(q ? { q } : {}, { replace: true })

    if (!q) {
      setResults([])
      setSearched(false)
      return
    }

    const reqId = ++requestIdRef.current
    setLoading(true)

    window.api.catalogApi
      .search(q, { limit: 60 })
      .then((res) => {
        if (requestIdRef.current !== reqId) return
        setResults(res?.items || [])
        setSearched(true)
      })
      .catch(() => {
        if (requestIdRef.current === reqId) {
          setResults([])
          setSearched(true)
        }
      })
      .finally(() => {
        if (requestIdRef.current === reqId) setLoading(false)
      })
  }, [debouncedQuery, setSearchParams])

  // Filtro por tipo/anime sobre los resultados
  const visibleResults = useMemo(() => {
    if (filter === 'all') return results
    if (filter === 'anime') return results.filter((r) => r.is_anime)
    return results.filter((r) => r.media_type === filter)
  }, [results, filter])

  return (
    <div className="px-10 lg:px-14 pt-28 pb-16 animate-fade-in">
      {/* Input grande estilo Apple */}
      <div className="max-w-[660px] mx-auto">
        <div className="relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-dim group-focus-within:text-accent transition-colors" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar películas, series, anime..."
            className="w-full h-14 pl-[52px] pr-5 rounded-2xl bg-surface-1 border border-white/[0.09] text-[17px] text-white placeholder:text-text-dim outline-none transition-all duration-200 focus:border-accent/60 focus:shadow-glow-sm"
          />
        </div>

        {/* Filtros rápidos */}
        <div className="flex items-center justify-center gap-2 mt-5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-[31px] px-4 rounded-full text-xs font-semibold transition-all duration-200 border ${
                filter === f.key
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'bg-white/[0.04] text-text-secondary border-white/[0.09] hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        {loading ? (
          <LoadingState variant="grid" count={12} />
        ) : visibleResults.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <MovieGrid movies={visibleResults} />
          </motion.div>
        ) : searched ? (
          <EmptyState
            icon={SearchX}
            title="No encontramos resultados para tu búsqueda"
            description={`Nada para "${debouncedQuery}". Probá con otro título.`}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Buscá algo para ver"
            description="Películas, series y anime en un solo lugar."
          />
        )}
      </div>
    </div>
  )
}

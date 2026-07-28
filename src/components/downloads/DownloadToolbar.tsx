import { Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react'
import { useDownloadEngineStore } from '../../stores/useDownloadEngineV3Store'
import type { DownloadFilters } from '../../stores/useDownloadEngineV3Store'

const STATE_OPTIONS: { value: DownloadFilters['state']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

const SORT_OPTIONS: { value: DownloadFilters['sortBy']; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'name', label: 'Name' },
  { value: 'progress', label: 'Progress' },
  { value: 'speed', label: 'Speed' },
  { value: 'eta', label: 'ETA' },
  { value: 'created', label: 'Created' },
]

export function DownloadToolbar() {
  const { filters, setFilters, status, setPaused } = useDownloadEngineStore()

  return (
    <div
      className="flex items-center gap-3 px-5 py-3 rounded-2xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Pause/resume all */}
      <button
        onClick={() => setPaused(!status?.isPaused)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
        style={{
          background: status?.isPaused ? 'var(--green)' : 'rgba(255,255,255,0.06)',
          color: status?.isPaused ? '#fff' : 'var(--text-dim)',
        }}
      >
        {status?.isPaused ? '▶ Resume' : '⏸ Pause'}
      </button>

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim" />
        <input
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Search downloads..."
          className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-white/[0.05] border border-white/[0.08] outline-none text-text-bright placeholder:text-text-dim transition-all focus:border-accent/30"
        />
      </div>

      {/* State filter */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.04]">
        {STATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilters({ state: opt.value })}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
              filters.state === opt.value
                ? 'text-white'
                : 'text-text-dim hover:text-text-primary'
            }`}
            style={{
              background:
                filters.state === opt.value ? 'var(--accent)' : 'transparent',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal className="w-3.5 h-3.5 text-text-dim" />
        <select
          value={filters.sortBy}
          onChange={(e) => setFilters({ sortBy: e.target.value as DownloadFilters['sortBy'] })}
          className="bg-transparent text-xs text-text-dim outline-none cursor-pointer hover:text-text-primary"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-bg-primary">
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFilters({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
          className="p-1 rounded hover:bg-white/[0.06] transition-colors"
          title={`Sort ${filters.sortOrder === 'asc' ? 'descending' : 'ascending'}`}
        >
          <ArrowUpDown
            className="w-3.5 h-3.5 text-text-dim"
            style={{
              transform: filters.sortOrder === 'asc' ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>
      </div>
    </div>
  )
}

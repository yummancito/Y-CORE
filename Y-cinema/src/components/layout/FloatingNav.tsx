import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Play, Search, Settings } from 'lucide-react'

const tabs = [
  { to: '/home', label: 'Inicio' },
  { to: '/catalog/movie', label: 'Películas' },
  { to: '/catalog/tv', label: 'Series' },
  { to: '/catalog/anime', label: 'Anime' },
  { to: '/favorites', label: 'Favoritos' },
  { to: '/history', label: 'Historial' },
]

export default function FloatingNav() {
  const navigate = useNavigate()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <header
      className="absolute top-0 left-0 right-0 z-50 flex items-center gap-5 px-8 py-[18px] pointer-events-none"
      style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.75), transparent)' }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/home')}
        className="flex items-center gap-2.5 cursor-pointer pointer-events-auto"
      >
        <div
          className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #6C63FF, #3BB2F7)',
            boxShadow: '0 4px 18px rgba(108,99,255,0.45)',
          }}
        >
          <Play className="w-3 h-3 text-white fill-white" />
        </div>
        <span
          className="text-base font-extrabold tracking-[2px] text-white"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Y·CINEMA
        </span>
      </button>

      <div className="flex-1" />

      {/* Tabs */}
      <nav
        className="flex items-center gap-1 p-[5px] rounded-[22px] pointer-events-auto"
        style={{
          background: 'rgba(15,15,18,0.62)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `h-[34px] flex items-center px-4 rounded-[17px] text-[13px] transition-colors duration-200 ${
                isActive
                  ? 'text-white font-semibold bg-white/[0.1] shadow-glow-sm'
                  : 'text-text-secondary font-medium hover:text-white'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Search */}
      <button
        onClick={() => navigate('/search')}
        className="flex items-center gap-2 h-[38px] px-4 rounded-[19px] text-text-secondary hover:text-white transition-colors duration-200 pointer-events-auto"
        style={{
          background: 'rgba(15,15,18,0.62)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.09)',
        }}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-[12.5px]">Buscar</span>
        <span className="text-[9.5px] bg-white/[0.07] border border-white/[0.1] rounded-[5px] px-1.5 py-0.5 whitespace-nowrap">
          Ctrl K
        </span>
      </button>

      {/* Ajustes */}
      <NavLink
        to="/settings"
        title="Ajustes"
        className={({ isActive }) =>
          `flex items-center justify-center w-[38px] h-[38px] rounded-full transition-colors duration-200 pointer-events-auto ${
            isActive ? 'text-accent' : 'text-text-secondary hover:text-white'
          }`
        }
        style={{
          background: 'rgba(15,15,18,0.62)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.09)',
        }}
      >
        <Settings className="w-4 h-4" />
      </NavLink>
    </header>
  )
}

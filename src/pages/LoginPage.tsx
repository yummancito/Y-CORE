import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuthStore } from '../stores/useAuthStore'
import { t } from '../lib/i18n'
import { Logo } from '../components/Logo'
import { TermsModal } from '../components/TermsModal'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [termsModal, setTermsModal] = useState<{ open: boolean; type: 'terms' | 'privacy' }>({ open: false, type: 'terms' })
  const { login, loading, error, clearError, init, initialized } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (initialized) {
      const from = (location.state as any)?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }, [initialized, navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (username.trim().length < 2) return
    await login(username.trim())
  }

  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center p-6 md:p-10 overflow-y-auto relative">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px] relative z-10"
      >
        <div className="flex flex-col gap-4 w-full">
          <div
            className="w-full rounded-3xl bg-zinc-950 border border-zinc-800/50 p-0 shadow-2xl shadow-black/50"
          >
            <form onSubmit={handleSubmit} className="px-8 py-5 flex flex-col gap-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="w-full flex justify-center"
              >
                <Logo
                  size={64}
                  className="text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.15)] block"
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold text-white">
                    {t('login.welcomeBack')}
                  </h1>
                  <p className="text-sm text-zinc-400 text-balance">
                    {t('login.loginSubtitle')}
                  </p>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col gap-2"
                >
                  <label htmlFor="username" className="text-sm font-medium text-zinc-300">
                    {t('login.username')}
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={2}
                    maxLength={32}
                    pattern="[a-zA-Z0-9_\- ]+"
                    autoComplete="username"
                    autoFocus
                    className="w-full h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-all duration-200 focus:border-zinc-500 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-700/50 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    placeholder="player123"
                  />
                </motion.div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 px-3.5 py-2.5 text-sm overflow-hidden"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:bg-zinc-100 hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? t('login.loading') : t('login.login')}
                </motion.button>
              </motion.div>
            </form>
          </div>

          <p className="px-6 text-center text-xs text-zinc-500">
            {t('login.terms')}{' '}
            <button
              type="button"
              onClick={() => setTermsModal({ open: true, type: 'terms' })}
              className="text-zinc-400 hover:text-white transition-colors hover:underline"
            >
              {t('login.termsOfService')}
            </button>{' '}
            {t('login.and')}{' '}
            <button
              type="button"
              onClick={() => setTermsModal({ open: true, type: 'privacy' })}
              className="text-zinc-400 hover:text-white transition-colors hover:underline"
            >
              {t('login.privacyPolicy')}
            </button>.
          </p>
        </div>
      </motion.div>

      <TermsModal
        open={termsModal.open}
        onClose={() => setTermsModal({ open: false, type: termsModal.type })}
        type={termsModal.type}
      />
    </div>
  )
}

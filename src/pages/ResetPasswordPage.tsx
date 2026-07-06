// Kept as fallback for direct reset links - currently code-based flow is in LoginPage
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { t } from '../lib/i18n'
import { resetPassword } from '../lib/y-core-api'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setMessage(t('login.passwordsMismatch'))
      return
    }
    if (!token) {
      setMessage(t('login.invalidResetToken'))
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password)
      setMessage(t('login.resetSuccess'))
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: any) {
      setMessage(err.message || t('login.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center p-6" style={{ background: 'var(--bg-darker)' }}>
      <div className="w-full max-w-[420px]">
        <div className="overflow-hidden rounded-2xl bg-transparent p-0">
          <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold text-white">{t('login.resetPassword')}</h1>
              <p className="text-sm text-text-dim">{t('login.newPassword')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium text-text-primary">{t('login.newPassword')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-10 rounded-xl px-3 py-2 text-sm text-text-bright placeholder:text-text-muted outline-none focus:border-accent transition-colors"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                placeholder="••••••••"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-text-primary">{t('login.confirmPassword')}</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-10 rounded-xl px-3 py-2 text-sm text-text-bright placeholder:text-text-muted outline-none focus:border-accent transition-colors"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                placeholder="••••••••"
              />
            </div>
            {message && (
              <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${message.includes(t('login.resetSuccess')) ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                {message}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t('login.loading') : t('login.resetPassword')}
            </button>
            <div className="text-center text-sm text-text-muted">
              <button type="button" onClick={() => navigate('/login')} className="text-text-dim hover:text-text-bright font-medium transition-colors">
                {t('login.backToLogin')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../stores/useAuthStore'
import { t } from '../lib/i18n'
import * as api from '../lib/y-core-api'
import { VerificationCodeInput } from '../components/VerificationCodeInput'
import { Logo } from '../components/Logo'
import { TermsModal } from '../components/TermsModal'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [codeVerified, setCodeVerified] = useState(false)
  const [termsModal, setTermsModal] = useState<{ open: boolean; type: 'terms' | 'privacy' }>({ open: false, type: 'terms' })
  const { user, loading, error, login, register, clearError, init, initialized } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    api.getAuthConfig().then((cfg) => {
      setEmailConfigured(cfg.emailConfigured)
      console.log('[LoginPage] Backend email configured:', cfg.emailConfigured, 'from:', cfg.fromEmail)
    }).catch(() => {
      setEmailConfigured(false)
    })
  }, [])

  useEffect(() => {
    if (initialized && user) {
      const from = (location.state as any)?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }, [user, initialized, navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setResetMessage('')
    if (mode === 'login') {
      await login(email, password)
    } else if (mode === 'register') {
      await register(email, password, username)
    } else if (mode === 'forgot') {
      if (!codeSent) {
        // Step 1: Send email with code
        setForgotLoading(true)
        try {
          await api.forgotPassword(email)
          setCodeSent(true)
          setResetMessage(t('login.codeSent'))
        } catch (err: any) {
          const msg = err.message || t('login.failedSendReset')
          if (msg.includes('Email service not configured')) {
            setResetMessage(t('login.emailNotConfigured'))
          } else if (err.status === 429) {
            setResetMessage(t('login.tooManyAttempts'))
          } else {
            setResetMessage(msg)
          }
        } finally {
          setForgotLoading(false)
        }
      } else if (!codeVerified) {
        // Step 2: Verify code only
        if (resetCode.length < 6) {
          setResetMessage(t('login.enterCode'))
          return
        }
        setForgotLoading(true)
        try {
          await api.verifyResetCode(resetCode)
          setCodeVerified(true)
          setResetMessage('')
        } catch (err: any) {
          setResetMessage(err.message || t('login.invalidCode'))
        } finally {
          setForgotLoading(false)
        }
      } else {
        // Step 3: Set new password
        if (password !== confirmPassword) {
          setResetMessage(t('login.passwordsMismatch'))
          return
        }
        try {
          await api.resetPassword(resetCode, password)
          setResetMessage(t('login.resetSuccess'))
          setTimeout(() => {
            setMode('login')
            setCodeSent(false)
            setCodeVerified(false)
            setResetCode('')
            setPassword('')
            setConfirmPassword('')
          }, 2000)
        } catch (err: any) {
          setResetMessage(err.message || t('login.failedResetPassword'))
        }
      }
    }
  }

  const switchMode = (target: 'login' | 'register' | 'forgot') => {
    setMode(target)
    clearError()
    setResetMessage('')
    setCodeSent(false)
    setCodeVerified(false)
    setResetCode('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center p-6 md:p-10 overflow-y-auto relative">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Card */}
        <div className="flex flex-col gap-4 w-full">
          <div
            className="w-full rounded-3xl bg-zinc-950 border border-zinc-800/50 p-0 shadow-2xl shadow-black/50"
          >
            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 py-5 flex flex-col gap-4">
              {/* Logo */}
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

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${mode}-${codeSent ? 'code' : 'form'}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="flex flex-col gap-5"
                >
                  {/* Header */}
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-2xl font-bold text-white">
                      {mode === 'login' ? t('login.welcomeBack') : mode === 'register' ? t('login.createAccount') : t('login.resetPassword')}
                    </h1>
                    <p className="text-sm text-zinc-400 text-balance">
                      {mode === 'login' ? t('login.loginSubtitle') : mode === 'register' ? t('login.registerSubtitle') : t('login.resetSubtitle')}
                    </p>
                    {mode === 'forgot' && emailConfigured === false && (
                      <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
                        {t('login.emailNotConfigured')}
                      </p>
                    )}
                  </div>
                  {/* Username */}
                  {mode === 'register' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
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
                        minLength={3}
                        maxLength={32}
                        pattern="[a-zA-Z0-9_-]+"
                        autoComplete="username"
                        className="w-full h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-all duration-200 focus:border-zinc-500 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-700/50 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                        placeholder={t('login.usernamePlaceholder')}
                      />
                    </motion.div>
                  )}

                  {/* Email */}
                  {(mode === 'login' || mode === 'register' || (mode === 'forgot' && !codeSent)) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex flex-col gap-2"
                    >
                      <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                        {t('login.email')}
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="w-full h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-all duration-200 focus:border-zinc-500 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-700/50 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                        placeholder="m@example.com"
                      />
                    </motion.div>
                  )}

                  {/* Reset Code */}
                  {mode === 'forgot' && codeSent && !codeVerified && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex flex-col gap-3"
                    >
                      <label className="text-sm font-medium text-zinc-300 text-center">
                        {t('login.enterCode')}
                      </label>
                      <VerificationCodeInput
                        value={resetCode}
                        onChange={setResetCode}
                        disabled={forgotLoading}
                      />
                    </motion.div>
                  )}

                  {/* Password */}
                  {(mode === 'login' || mode === 'register' || (mode === 'forgot' && codeVerified)) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center">
                        <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                          {mode === 'forgot' ? t('login.newPassword') : t('login.password')}
                        </label>
                        {mode === 'login' && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => switchMode('forgot')}
                            className="ml-auto text-sm text-zinc-400 underline-offset-2 hover:text-white hover:underline transition-colors"
                          >
                            {t('login.forgotPassword')}
                          </motion.button>
                        )}
                      </div>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={mode === 'register' || (mode === 'forgot' && codeVerified) ? 8 : 1}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="w-full h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-all duration-200 focus:border-zinc-500 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-700/50 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                        placeholder="••••••••"
                      />
                    </motion.div>
                  )}

                  {/* Confirm Password */}
                  {mode === 'forgot' && codeVerified && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-col gap-2"
                    >
                      <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-300">
                        {t('login.confirmPassword')}
                      </label>
                      <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-all duration-200 focus:border-zinc-500 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-700/50 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                        placeholder="••••••••"
                      />
                    </motion.div>
                  )}

                  {/* Error / Reset Message */}
                  <AnimatePresence>
                    {(error || resetMessage) && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className={`rounded-xl border px-3.5 py-2.5 text-sm overflow-hidden ${resetMessage && !error ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}
                      >
                        {error || resetMessage}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={loading || forgotLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:bg-zinc-100 hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(loading || forgotLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading || forgotLoading
                      ? t('login.loading')
                      : mode === 'login'
                        ? t('login.login')
                        : mode === 'register'
                          ? t('login.createAccountBtn')
                          : !codeSent
                            ? t('login.sendResetLink')
                            : !codeVerified
                              ? t('login.verifyCode')
                              : t('login.resetPassword')}
                  </motion.button>

                  {/* Switch mode */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="text-center text-sm text-zinc-500"
                  >
                    {mode !== 'forgot' && (
                      <>
                        {mode === 'login' ? t('login.noAccount') + ' ' : t('login.hasAccount') + ' '}
                        <button
                          type="button"
                          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                          className="text-zinc-300 hover:text-white font-medium transition-colors hover:underline"
                        >
                          {mode === 'login' ? t('login.signUp') : t('login.signIn')}
                        </button>
                      </>
                    )}
                    {mode === 'forgot' && (
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="text-zinc-300 hover:text-white font-medium transition-colors hover:underline"
                      >
                        {t('login.backToLogin')}
                      </button>
                    )}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </form>
          </div>

          {/* Terms */}
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

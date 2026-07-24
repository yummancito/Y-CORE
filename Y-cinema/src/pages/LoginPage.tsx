import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn, UserPlus } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.push)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'signIn') {
        await signIn(email, password)
        pushToast('Sesión iniciada', 'success')
      } else {
        await signUp(email, password)
        pushToast('Cuenta creada', 'success')
      }
      navigate(-1)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Algo salió mal', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <motion.div
        className="w-full max-w-[380px]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1
          className="text-3xl font-extrabold tracking-[-0.02em] text-white text-center"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          {mode === 'signIn' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h1>
        <p className="text-[13px] text-text-dim mt-2 text-center">
          Opcional — favoritos e historial siguen guardados localmente.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-[12px] font-medium text-text-secondary" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[14px] text-white placeholder:text-text-dim focus:outline-none focus:border-accent/50"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-text-secondary" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[14px] text-white placeholder:text-text-dim focus:outline-none focus:border-accent/50"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-accent text-black text-[14px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {mode === 'signIn' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'Un momento...' : mode === 'signIn' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          className="mt-5 w-full text-center text-[13px] text-text-dim hover:text-white transition-colors"
        >
          {mode === 'signIn' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Iniciá sesión'}
        </button>
      </motion.div>
    </div>
  )
}

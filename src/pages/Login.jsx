import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import cruxLogo from '../../crux_logo.jpg'
import { GYM_DISPLAY_NAME, THEME_LOGO_URL } from '../constants/gym'
import { toSpanishError } from '../utils/errors'

const logoSrc = THEME_LOGO_URL || cruxLogo
import { PasswordInput } from '../components/PasswordInput'

export function LoginPage() {
  const {
    session,
    authLoading,
    signInWithEmail,
    signUpWithEmail,
    blockedAccount,
    clearBlockedMessage,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [name, setName] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const hash = window.location.hash?.replace(/^#/, '')
    if (!hash) return
    const params = new URLSearchParams(hash)
    const type = params.get('type')
    const accessToken = params.get('access_token')
    if (type === 'signup' && accessToken) {
      setSuccess('Email confirmado. Ya podés iniciar sesión.')
      setMode('login')
    }
  }, [])

  if (!authLoading && session) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password)
        navigate('/app', { replace: true })
      } else {
        const data = await signUpWithEmail(email, password, name)
        // Si el proyecto requiere confirmación por email, Supabase no entrega sesión.
        if (!data?.session) {
          setMode('login')
          setSuccess(
            'Te enviamos un correo para verificar tu cuenta. Revisá tu bandeja (y spam) antes de iniciar sesión.',
          )
          return
        }
        navigate('/app', { replace: true })
      }
    } catch (err) {
      const fallback =
        mode === 'login' ? 'No se pudo iniciar sesión' : 'No se pudo crear la cuenta'
      setError(toSpanishError(err, fallback))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f4fbfc] via-[#ecf5f7] to-[#ddeaf0] px-4">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#d0dde2] bg-white/95 p-8 shadow-2xl shadow-[#b6cad3]/60 backdrop-blur">
        <div className="mb-6 flex flex-col items-center justify-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md">
            <img
              src={logoSrc}
              alt={GYM_DISPLAY_NAME}
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            {GYM_DISPLAY_NAME}
          </h1>
          <p className="text-xs text-slate-500">
            Sistema de asistencias
          </p>
        </div>

        <div className="mb-6">
          <Link
            to="/"
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            ← Volver al inicio
          </Link>
          <h2 className="text-base font-semibold text-slate-800">
            {mode === 'login' ? 'Inicia sesión' : 'Crea una cuenta'}
          </h2>
        </div>

        {blockedAccount && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <p className="font-medium">Tu cuenta está suspendida.</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Contactá al administrador del gimnasio para poder volver a acceder.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-amber-700 underline-offset-2 hover:underline"
              onClick={clearBlockedMessage}
            >
              Entendido
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <p>{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Nombre y apellido
              </label>
              <input
                id="name"
                type="text"
                required
                className="input"
                placeholder="Tu nombre completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              className="input"
              placeholder="admin@gimnasio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Contraseña
            </label>
            <PasswordInput
              id="password"
              required
              className="input"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            {submitting
              ? mode === 'login'
                ? 'Entrando…'
                : 'Creando cuenta…'
              : mode === 'login'
                ? 'Entrar'
                : 'Registrarme'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-600">
          {mode === 'login' ? (
            <>
              ¿No tienes cuenta?{' '}
              <button
                type="button"
                className="font-semibold text-brand-600 underline-offset-2 hover:underline"
                onClick={() => {
                  setMode('register')
                  setError(null)
                  setSuccess(null)
                }}
              >
                Crear cuenta
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{' '}
              <button
                type="button"
                className="font-semibold text-brand-600 underline-offset-2 hover:underline"
                onClick={() => {
                  setMode('login')
                  setError(null)
                  setSuccess(null)
                }}
              >
                Iniciar sesión
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}


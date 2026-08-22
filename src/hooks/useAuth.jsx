import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { DEFAULT_GYM_ID } from '../constants/gym'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const auth = useProvideAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}

/** Un gimnasio pausado bloquea el login de su admin/coach/student — superadmin no tiene gym_id y no aplica. */
async function isGymPaused(profile) {
  if (!profile || profile.role === 'superadmin' || !profile.gym_id) return false
  const { data: gym } = await supabase
    .from('gyms')
    .select('paused_at')
    .eq('id', profile.gym_id)
    .maybeSingle()
  return Boolean(gym?.paused_at)
}

function isInvalidRefreshTokenError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found')
  )
}

function useProvideAuth() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [blockedAccount, setBlockedAccount] = useState(false)
  const [gymPausedAccount, setGymPausedAccount] = useState(false)

  useEffect(() => {
    let active = true

    async function loadSessionAndProfile() {
      setLoading(true)
      setBlockedAccount(false)
      setGymPausedAccount(false)
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          // Token viejo/inválido en storage local: limpiamos sesión local y seguimos.
          await supabase.auth.signOut({ scope: 'local' })
        } else {
          // eslint-disable-next-line no-console
          console.error('Error obteniendo sesión de Supabase', error)
        }
      }

      if (!active) return

      setSession(session || null)
      setUser(session?.user || null)

      if (session?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id) // mismo uuid que auth.users.id
          .maybeSingle()

        if (profileError) {
          // eslint-disable-next-line no-console
          console.error('Error obteniendo perfil de usuario', profileError)
        }

        if (active) {
          const gymPaused = await isGymPaused(profile)

          if (profile?.blocked) {
            setBlockedAccount(true)
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
            setProfile(null)
          } else if (gymPaused) {
            setGymPausedAccount(true)
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
            setProfile(null)
          } else {
            setProfile(profile || null)
          }
        }
      } else {
        setProfile(null)
      }

      if (active) setLoading(false)
    }

    loadSessionAndProfile()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user || null)
      if (!newSession) {
        setProfile(null)
      } else {
        // recargar perfil cuando cambie la sesión
        ;(async () => {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', newSession.user.id)
            .maybeSingle()

          const gymPaused = await isGymPaused(profile)

          if (profile?.blocked) {
            setBlockedAccount(true)
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
            setProfile(null)
          } else if (gymPaused) {
            setGymPausedAccount(true)
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
            setProfile(null)
          } else {
            setProfile(profile || null)
          }
        })()
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  const signUpWithEmail = async (email, password, name, gymId) => {
    const normalizedEmail = String(email ?? '')
      .trim()
      .toLowerCase()
    // gymId viene del link de invitación del gimnasio (/login?gym=<id>) — Crew es
    // compartido por varios gimnasios, sin link válido cae al gimnasio por defecto
    // (comportamiento histórico, de cuando el sistema era de un solo gimnasio).
    const resolvedGymId = gymId || DEFAULT_GYM_ID

    // Validación previa: evitar enviar correo de registro si ya existe un usuario
    // (por ejemplo, un profesor) con el mismo email en el mismo gimnasio.
    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', normalizedEmail)
      .eq('gym_id', resolvedGymId)
      .limit(1)
      .maybeSingle()

    if (existingUserError) throw existingUserError
    if (existingUser) {
      throw new Error(
        'Ya existe una cuenta con ese email en este gimnasio. Si ya tenés cuenta, iniciá sesión.',
      )
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        // handle_new_user (trigger, SECURITY DEFINER) lee esto para asignar el gimnasio
        // correcto ya en el insert — necesario porque si el proyecto requiere confirmación
        // por email, el upsert de más abajo corre sin sesión y RLS lo bloquea.
        data: { name: name || '', gym_id: resolvedGymId },
      },
    })
    if (error) throw error

    const authUser = data.user

    if (authUser) {
      // Respaldo por si el trigger handle_new_user no corrió: intenta crear/actualizar
      // el perfil. No-fatal — si Supabase requiere confirmación por email, este upsert
      // corre sin sesión activa (auth.uid() es null) y RLS lo bloquea; el trigger
      // (SECURITY DEFINER, no pasa por RLS) ya creó la fila igual, así que un error acá
      // no debe mostrarse como si el registro hubiera fallado.
      const { error: profileError } = await supabase.from('users').upsert(
        {
          id: authUser.id,
          email: normalizedEmail,
          name: name || authUser.email,
          role: 'student',
          gym_id: resolvedGymId,
        },
        { onConflict: 'id' },
      )

      if (profileError) {
        // eslint-disable-next-line no-console
        console.warn('No se pudo sincronizar el perfil tras el registro (no fatal)', profileError)
      }
    }

    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const isAdmin = profile?.role === 'admin'
  const isStudent = profile?.role === 'student'
  const isCoach = profile?.role === 'coach'
  const isSuperAdmin = profile?.role === 'superadmin'

  const clearBlockedMessage = () => setBlockedAccount(false)
  const clearGymPausedMessage = () => setGymPausedAccount(false)

  return {
    session,
    user,
    profile,
    isAdmin,
    isStudent,
    isCoach,
    isSuperAdmin,
    authLoading: loading,
    blockedAccount,
    clearBlockedMessage,
    gymPausedAccount,
    clearGymPausedMessage,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }
}


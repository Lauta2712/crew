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

  useEffect(() => {
    let active = true

    async function loadSessionAndProfile() {
      setLoading(true)
      setBlockedAccount(false)
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
        let { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id) // mismo uuid que auth.users.id
          .maybeSingle()

        if (profileError) {
          // eslint-disable-next-line no-console
          console.error('Error obteniendo perfil de usuario', profileError)
        }

        if (active) {
          // Aseguramos que los estudiantes siempre tengan gym_id para que RLS
          // (si filtra por gym_id) no les bloquee lecturas como payments/subscriptions.
          if (
            profile?.role === 'student' &&
            (profile.gym_id == null || profile.gym_id === '')
          ) {
            try {
              await supabase
                .from('users')
                .update({ gym_id: DEFAULT_GYM_ID })
                .eq('id', session.user.id)

              const { data: updatedProfile } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle()

              profile = updatedProfile ?? profile
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('No se pudo normalizar gym_id del estudiante', e)
            }
          }

          if (profile?.blocked) {
            setBlockedAccount(true)
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
          let { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', newSession.user.id)
            .maybeSingle()

          if (
            profile?.role === 'student' &&
            (profile.gym_id == null || profile.gym_id === '')
          ) {
            try {
              await supabase
                .from('users')
                .update({ gym_id: DEFAULT_GYM_ID })
                .eq('id', newSession.user.id)

              const { data: updatedProfile } = await supabase
                .from('users')
                .select('*')
                .eq('id', newSession.user.id)
                .maybeSingle()
              profile = updatedProfile ?? profile
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('No se pudo normalizar gym_id del estudiante', e)
            }
          }

          if (profile?.blocked) {
            setBlockedAccount(true)
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

  const signUpWithEmail = async (email, password, name) => {
    const normalizedEmail = String(email ?? '')
      .trim()
      .toLowerCase()

    // Validación previa: evitar enviar correo de registro si ya existe un usuario
    // (por ejemplo, un profesor) con el mismo email en el mismo gimnasio.
    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', normalizedEmail)
      .eq('gym_id', DEFAULT_GYM_ID)
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
          gym_id: DEFAULT_GYM_ID,
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

  const clearBlockedMessage = () => setBlockedAccount(false)

  return {
    session,
    user,
    profile,
    isAdmin,
    isStudent,
    isCoach,
    authLoading: loading,
    blockedAccount,
    clearBlockedMessage,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }
}


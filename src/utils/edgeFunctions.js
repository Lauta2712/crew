import { supabase } from '../services/supabaseClient'

/**
 * Invoca una Edge Function enviando siempre el JWT del usuario logueado.
 *
 * El `fetch` interno del cliente solo agrega `Authorization` si el header no existe;
 * en algunos casos `getSession()` puede no coincidir con el token que usa el SDK y
 * termina enviándose el anon key: el gateway o `auth.getUser()` en la función
 * responden 401. Forzar el Bearer del usuario evita eso.
 */
export async function invokeEdgeFunctionWithUserJwt(functionName, invokeOptions = {}) {
  const {
    data: { session: initial },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) throw sessionError

  let session = initial
  if (!session?.access_token) {
    const err = new Error(
      'No hay sesión de usuario activa. Cerrá sesión y volvé a entrar con tu cuenta de administrador.',
    )
    err.code = 'NO_USER_JWT'
    throw err
  }

  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0
  if (expiresAtMs > 0 && expiresAtMs < Date.now() + 60_000) {
    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession()
    if (!refreshError && refreshed?.session?.access_token) {
      session = refreshed.session
    }
  }

  return supabase.functions.invoke(functionName, {
    ...invokeOptions,
    headers: {
      ...(invokeOptions.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  })
}

/**
 * Mensaje legible cuando `supabase.functions.invoke` falla (4xx/5xx o red).
 * El SDK guarda el `Response` en `error.context`; el JSON `{ error: "..." }` no viene en `data`.
 * @param {string} [functionName] Nombre de la función (ej. `delete-student`) para el mensaje 404.
 */
export async function getFunctionsInvokeFailureMessage(error, functionName = 'Edge Function') {
  if (!error) return ''
  if (error.name === 'FunctionsFetchError') {
    const fn = functionName || 'la función'
    return (
      `El navegador no pudo contactar a las Edge Functions de Supabase (${fn}). ` +
      'Suele pasar si la función no está desplegada en ese proyecto, la URL del proyecto (.env) es otra, o hay bloqueo de red/firewall. ' +
      `En Supabase Dashboard → Edge Functions verificá que exista «${functionName}»; si no, desde la repo: supabase functions deploy ${functionName}.`
    )
  }
  const res = error.context

  // Primero el cuerpo (la función suele devolver { error: "..." } con 401/403).
  if (res && typeof res.clone === 'function') {
    try {
      const body = await res.clone().json()
      if (body && body.error != null) return String(body.error)
    } catch {
      /* no es JSON */
    }
    try {
      const text = (await res.clone().text()).trim()
      if (text && text.length > 0 && text.length < 800) return text
    } catch {
      /* ignore */
    }
  }

  if (res && typeof res.status === 'number') {
    if (res.status === 404) {
      return `La función «${functionName}» no está en este proyecto (404). En Supabase: Edge Functions → desplegala, o con CLI: supabase functions deploy ${functionName}.`
    }
    if (res.status === 401) {
      return 'No autorizado (401). Si acabás de entrar, probá cerrar sesión y volver a iniciar sesión. En Supabase → Edge Functions → «' +
        functionName +
        '»: debe estar habilitada la verificación JWT con el mismo proyecto que usa la app.'
    }
    if (res.status === 403) {
      return 'Prohibido (403). Revisá que tu usuario sea admin en public.users y que la función valide el JWT correctamente.'
    }
  }
  return error.message || ''
}

export function toSpanishError(error, fallback = 'Ocurrió un error inesperado.') {
  const raw = error?.message || error?.details || ''
  const message = String(raw).toLowerCase()

  if (!message) return fallback
  if (message.includes('email rate limit exceeded') || message.includes('rate limit exceeded')) {
    return 'Se superó el límite de envío de emails. Esperá unos minutos y probá nuevamente.'
  }
  if (message.includes('invalid login credentials') || message.includes('invalid login')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (message.includes('invalid password') || message.includes('password')) {
    return 'La contraseña no es válida. Verificá e intentá nuevamente.'
  }
  if (message.includes('email not confirmed') || message.includes('not confirmed')) {
    return 'Tenés que confirmar tu correo electrónico antes de iniciar sesión.'
  }
  if (message.includes('user not found')) {
    return 'No se encontró una cuenta con ese correo.'
  }
  if (message.includes('violates row-level security policy')) {
    return 'No tienes permisos para realizar esta acción.'
  }
  if (message.includes('permission denied')) {
    return 'Permiso denegado para realizar esta operación.'
  }
  if (
    message.includes('unique_user_email_per_gym') ||
    message.includes('(gym_id, email)') ||
    message.includes('unique_email_lower') ||
    message.includes('ya existe una cuenta con ese email') ||
    message.includes('user already registered') ||
    message.includes('email address has already been registered') ||
    message.includes('email already exists')
  ) {
    return 'Ya existe una cuenta con ese email. Iniciá sesión con esa cuenta o usá otro correo.'
  }
  if (message.includes('duplicate key value')) {
    return 'Ya existe un registro con esos datos.'
  }
  if (message.includes('invalid input syntax')) {
    return 'Hay datos con un formato inválido.'
  }
  if (message.includes('foreign key constraint')) {
    return 'No se puede completar la acción por datos relacionados.'
  }
  // NUNCA usar solo "token" o "jwt": frases como "Falta el token de autorización"
  // (Edge Functions) contienen "token" pero no indican sesión expirada.
  if (
    message.includes('falta el token de autorización') ||
    message.includes('falta el header authorization')
  ) {
    return 'La función no recibió el encabezado de autorización. Recargá la página o cerrá sesión y volvé a entrar. Si usás otro dominio o proxy, comprobá que no quite el header Authorization.'
  }
  const sessionLikelyExpired =
    /\bjwt\b.*\b(expired|invalid|malformed)\b/.test(message) ||
    /\b(expired|invalid)\s+jwt\b/.test(message) ||
    message.includes('token expired') ||
    message.includes('refresh token not found') ||
    message.includes('invalid refresh token') ||
    message.includes('session expired') ||
    message.includes('auth session missing') ||
    message.includes('invalid_grant')
  if (sessionLikelyExpired) {
    return 'Tu sesión expiró o dejó de ser válida. Cerrá sesión e iniciá sesión de nuevo.'
  }

  // Sin mapeo: si hay mensaje concreto, mostrarlo (Edge Functions / API).
  const rawStr = String(raw).trim()
  if (rawStr) {
    const genericSdk =
      rawStr === 'Edge Function returned a non-2xx status code' ||
      rawStr.startsWith('FunctionsHttpError')
    if (genericSdk) return fallback
    // Ya viene explicado (p. ej. getFunctionsInvokeFailureMessage): no duplicar el fallback.
    if (rawStr.length > 60 || /[áéíóúñ¿¡]/i.test(rawStr)) {
      return rawStr
    }
    if (fallback && !fallback.includes(rawStr)) {
      return `${fallback} — ${rawStr}`
    }
    return rawStr
  }
  return fallback
}

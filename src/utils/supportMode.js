const STORAGE_KEY = 'crew_support_return'

/**
 * Guarda la sesión de superadmin antes de "entrar como" el admin de un gimnasio
 * (modo soporte), para poder restaurarla después sin volver a loguearse.
 * sessionStorage: vive solo en esta pestaña, se pierde al cerrarla — no persiste
 * entre navegadores ni queda colgado si el superadmin simplemente cierra sesión.
 */
export function saveSupportReturnSession(session, gymName) {
  if (!session?.access_token || !session?.refresh_token) return
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        gym_name: gymName ?? null,
      }),
    )
  } catch {
    // sessionStorage no disponible — el "volver a superadmin" simplemente no aparecerá.
  }
}

export function getSupportReturnSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.access_token || !parsed?.refresh_token) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSupportReturnSession() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}

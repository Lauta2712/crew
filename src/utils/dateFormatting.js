const GYM_TZ = 'America/Argentina/Buenos_Aires'

/** Postgres `timestamp` columns devuelven sin 'Z'; forzamos UTC para evitar desfase. */
function parseUtc(iso) {
  if (!iso) return null
  const s = String(iso).trim()
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateTime(iso) {
  const d = parseUtc(iso)
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    timeZone: GYM_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso) {
  const d = parseUtc(iso)
  if (!d) return '—'
  return d.toLocaleDateString('es-AR', {
    timeZone: GYM_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateLong(iso) {
  const d = parseUtc(iso)
  if (!d) return '—'
  return d.toLocaleDateString('es-AR', {
    timeZone: GYM_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatTime(iso) {
  const d = parseUtc(iso)
  if (!d) return '—'
  return d.toLocaleTimeString('es-AR', {
    timeZone: GYM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatNow() {
  return new Date().toLocaleTimeString('es-AR', {
    timeZone: GYM_TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Returns today's date as YYYY-MM-DD in gym timezone (suitable for <input type="date">). */
export function todayInputString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: GYM_TZ })
}

/** Converts a YYYY-MM-DD input string to an ISO timestamp at noon local time. */
export function dateInputToAttendedAt(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

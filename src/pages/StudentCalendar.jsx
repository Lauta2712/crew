import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isUnlimitedPack } from '../constants/packs'
import { computeAttendancePolicy, inclusiveCycleEndLabel } from '../utils/attendancePolicy'
import { toSpanishError } from '../utils/errors'

const GYM_TZ = 'America/Argentina/Buenos_Aires'

const DAY_NAME_TO_JS = {
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
  domingo: 0,
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

/** Lunes = 0 … domingo = 6 */
function mondayFirstOffset(d) {
  return (d.getDay() + 6) % 7
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function sameLocalCalendarDay(iso, date) {
  if (!iso) return false
  const d = parseUtc(iso)
  if (!d) return false
  const isoDay = d.toLocaleDateString('en-CA', { timeZone: GYM_TZ })
  const cellDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return isoDay === cellDay
}

function parseDays(daysStr) {
  const result = []
  const lower = (daysStr ?? '').toLowerCase()
  Object.entries(DAY_NAME_TO_JS).forEach(([name, jsDay]) => {
    if (lower.includes(name) && !result.includes(jsDay)) result.push(jsDay)
  })
  return result
}

function slotTimeLabel(timeStr) {
  const t = (timeStr ?? '').trim()
  return t || '—'
}

/**
 * Returns the time labels for a given weekday in a schedule.
 * If slotKey is provided (format "days|time"), only the matching slot is returned.
 */
function getSlotLabelsForWeekday(schedule, jsDay, slotKey = null) {
  const labels = []
  const seen = new Set()
  if (!schedule?.slots) return labels

  let filterDays = null
  let filterTime = null
  if (slotKey) {
    const sep = slotKey.indexOf('|')
    if (sep !== -1) {
      filterDays = slotKey.slice(0, sep)
      filterTime = slotKey.slice(sep + 1)
    }
  }

  for (const slot of schedule.slots) {
    // When a specific slot was chosen, skip all others
    if (filterDays !== null && (slot.days !== filterDays || slot.time !== filterTime)) continue
    const days = parseDays(slot.days)
    if (!days.includes(jsDay)) continue
    const label = slotTimeLabel(slot.time)
    if (!seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }
  return labels
}

function parseUtc(iso) {
  if (!iso) return null
  const s = String(iso).trim()
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

const PACK_SHORT_LABELS = {
  single: '1 clase',
  pack4: 'Pack 4',
  pack8: 'Pack 8',
  grupo_entrenamiento: 'Grupo',
  muro_libre_mensual: 'Acceso libre mensual',
}

function packShortLabel(packType, catalogPacks) {
  if (!packType) return null
  if (PACK_SHORT_LABELS[packType]) return PACK_SHORT_LABELS[packType]
  const found = (catalogPacks ?? []).find((p) => p.id === packType)
  return found?.name ?? packType
}

function formatClock(iso) {
  const d = parseUtc(iso)
  if (!d) return '—'
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: GYM_TZ,
    hour12: false,
  })
}

function formatMonthYearES(d) {
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Anillos de celda del calendario — inline para evitar fallos de utilidades en v4. */
const CAL_EDGE_TODAY = '0 0 0 2px var(--color-brand-500)'
const CAL_EDGE_ATTENDANCE = '0 0 0 1px rgba(56, 189, 248, 0.5)' // sky-400 @ 50%

function monthAnchor(y, m) {
  return new Date(y, m, 1)
}

export function StudentCalendarPage() {
  const { profile } = useAuth()
  const { classPacks, scheduleTypes, walkIn } = useGymCatalog()
  const [viewYM, setViewYM] = useState(() => {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth() }
  })
  const [monthAttendances, setMonthAttendances] = useState([])
  const [policyAttendances, setPolicyAttendances] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const shiftViewMonth = useCallback((delta) => {
    setViewYM(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }, [])

  const goToCurrentMonth = useCallback(() => {
    const n = new Date()
    setViewYM({ y: n.getFullYear(), m: n.getMonth() })
  }, [])

  const loadData = useCallback(
    async (silent = false) => {
      if (!profile) {
        if (!silent) setLoading(false)
        return
      }
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        const ref = monthAnchor(viewYM.y, viewYM.m)
        const { start: ms, end: me } = getMonthRange(ref)
        const policyFrom = new Date(viewYM.y, viewYM.m - 1, 1, 0, 0, 0, 0)

        const [attMonthRes, attPolicyRes, payRes] = await Promise.all([
          supabase
            .from('attendances')
            .select('id, attended_at, student_id, checkin_method')
            .eq('student_id', profile.id)
            .gte('attended_at', ms.toISOString())
            .lte('attended_at', me.toISOString())
            .order('attended_at', { ascending: true }),
          supabase
            .from('attendances')
            .select('id, attended_at, student_id, checkin_method')
            .eq('student_id', profile.id)
            .gte('attended_at', policyFrom.toISOString())
            .order('attended_at', { ascending: false })
            .limit(200),
          supabase
            .from('payments')
            .select('id, paid_at, student_id, pack_type, schedule_type, schedule_slot')
            .eq('student_id', profile.id)
            .order('paid_at', { ascending: false })
            .limit(12),
        ])

        if (attMonthRes.error) throw attMonthRes.error
        if (attPolicyRes.error) throw attPolicyRes.error
        if (payRes.error) throw payRes.error

        setMonthAttendances(attMonthRes.data ?? [])
        setPolicyAttendances(attPolicyRes.data ?? [])
        setPayments(payRes.data ?? [])
      } catch (err) {
        setError(toSpanishError(err, 'No se pudo cargar el calendario'))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [profile, viewYM.y, viewYM.m],
  )

  useEffect(() => {
    let active = true
    async function run() {
      if (!active) return
      await loadData()
    }
    run()
    return () => {
      active = false
    }
  }, [loadData])

  useEffect(() => {
    if (!profile) return undefined
    const channel = supabase
      .channel(`student-calendar-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `student_id=eq.${profile.id}` },
        () => loadData(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendances', filter: `student_id=eq.${profile.id}` },
        () => loadData(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, loadData])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  // Use only class payments (not the unlimited walk-in pack) for schedule/slot derivation.
  // El acceso libre tiene su propio QR; el calendario siempre refleja el horario de clases.
  const classPayments = useMemo(
    () => (payments ?? []).filter((p) => !isUnlimitedPack(p.pack_type, classPacks)),
    [payments, classPacks],
  )

  // Exclude muro libre check-ins so they don't count against class pack quotas in the calendar
  const classAttendances = useMemo(
    () =>
      (policyAttendances ?? []).filter(
        (a) => a.checkin_method !== 'qr_muro_libre' && a.checkin_method !== 'manual_muro_libre',
      ),
    [policyAttendances],
  )

  const policy = useMemo(
    () =>
      computeAttendancePolicy({
        payments: classPayments,
        attendances: classAttendances,
        classPacks,
        walkIn,
      }),
    [classPayments, classAttendances, classPacks, walkIn],
  )

  const schedulePayment = policy.currentPayment
  const schedule = schedulePayment
    ? scheduleTypes.find((s) => s.id === schedulePayment.schedule_type) ?? null
    : null
  // Specific slot chosen when the payment was registered (null = show all slots)
  const scheduleSlotKey = schedulePayment?.schedule_slot ?? null
  const packClassesCap = schedulePayment
    ? classPacks.find((p) => p.id === schedulePayment.pack_type)?.classes_per_month ?? 0
    : 0

  const remainingForSlots = packClassesCap <= 0 ? null : policy.remainingClasses

  const isMuroCheckin = (a) =>
    a.checkin_method === 'qr_muro_libre' || a.checkin_method === 'manual_muro_libre'

  const cycleEndExclusive = policy.validUntil ? new Date(policy.validUntil) : null
  const packPaidAt = schedulePayment?.paid_at ? new Date(schedulePayment.paid_at) : null

  // Local calendar day (YYYY-MM-DD) on which the pack expires, for marking the cell
  const cycleEndLocalDay = cycleEndExclusive
    ? cycleEndExclusive.toLocaleDateString('en-CA', { timeZone: GYM_TZ })
    : null

  const realNow = new Date()
  const todayStart = startOfLocalDay(realNow)
  const displayRef = monthAnchor(viewYM.y, viewYM.m)
  const { start: monthStart, end: monthEnd } = getMonthRange(displayRef)
  const isViewingCurrentMonth =
    viewYM.y === realNow.getFullYear() && viewYM.m === realNow.getMonth()

  const days = []
  for (let d = 1; d <= monthEnd.getDate(); d += 1) {
    days.push(new Date(viewYM.y, viewYM.m, d))
  }

  const leadEmpty = mondayFirstOffset(monthStart)

  function isExpiryDay(date) {
    if (!cycleEndLocalDay) return false
    const cellDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return cellDay === cycleEndLocalDay
  }

  function paymentsOnDay(date) {
    return (payments ?? []).filter((p) => sameLocalCalendarDay(p.paid_at, date))
  }

  function attendancesOnDay(date) {
    return monthAttendances.filter((a) => sameLocalCalendarDay(a.attended_at, date))
  }

  function dayInPackValidity(date) {
    if (!cycleEndExclusive || !packPaidAt) return false
    const dayStart = startOfLocalDay(date)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)
    return dayEnd >= packPaidAt && dayStart < cycleEndExclusive
  }

  function showPossibleSlots(date) {
    if (!schedule?.slots?.length) return false
    if (!dayInPackValidity(date)) return false
    const dayStart = startOfLocalDay(date)
    if (dayStart.getTime() < todayStart.getTime()) return false
    if (remainingForSlots !== null && remainingForSlots <= 0) return false
    const labels = getSlotLabelsForWeekday(schedule, date.getDay())
    return labels.length > 0
  }

  const monthTitle = formatMonthYearES(displayRef)

  const totalGridCells = leadEmpty + days.length
  const numWeekRows = Math.ceil(totalGridCells / 7)

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-1 max-sm:-mx-2.5 max-sm:w-[calc(100%+1.25rem)] sm:mx-0 sm:w-full">
      {error && (
        <p className="shrink-0 rounded border border-red-500/40 bg-red-950/40 px-2 py-1 text-[10px] text-red-400 max-sm:mx-2.5 sm:mx-0">
          {error}
        </p>
      )}

      <div className="card flex min-h-0 min-w-0 flex-1 flex-col px-1 py-1.5 sm:p-2">
        {policy.validUntil && (
          <div className="mb-1 shrink-0 flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[10px] text-rose-400 sm:text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
            <span>
              Pack activo:{' '}
              <span className="font-semibold">vence el {inclusiveCycleEndLabel(policy.validUntil)}</span>
            </span>
          </div>
        )}

        <div className="mb-1.5 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex items-center justify-center gap-0.5 sm:justify-start">
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm font-medium text-ink hover:bg-bg"
              aria-label="Mes anterior"
              onClick={() => shiftViewMonth(-1)}
            >
              ‹
            </button>
            <p className="min-w-[9.5rem] flex-1 text-center text-xs font-semibold text-ink sm:min-w-[11rem] sm:flex-none">
              {monthTitle}
            </p>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm font-medium text-ink hover:bg-bg"
              aria-label="Mes siguiente"
              onClick={() => shiftViewMonth(1)}
            >
              ›
            </button>
            {!isViewingCurrentMonth && (
              <button
                type="button"
                className="ml-1 rounded-md border border-brand-500/40 bg-brand-900/25 px-2 py-0.5 text-[10px] font-medium text-brand-400 hover:bg-brand-900/35"
                onClick={goToCurrentMonth}
              >
                Hoy
              </button>
            )}
          </div>
          <div className="flex w-full justify-center sm:w-auto sm:justify-end">
            <div
              className="w-full rounded-lg bg-bg/90 px-2 py-1 sm:w-auto sm:px-2.5 sm:py-1.5"
              aria-label="Referencia del calendario"
            >
              <p className="mb-0.5 text-center text-[8px] font-semibold uppercase tracking-wide text-muted sm:mb-1 sm:text-left sm:text-[9px]">
                Referencia
              </p>
              <div className="flex flex-row flex-wrap items-center justify-center gap-x-1 gap-y-0.5 sm:justify-end sm:gap-x-2 sm:gap-y-0">
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[8px] text-ink sm:gap-1.5 sm:text-[11px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-sky-400 sm:h-2.5 sm:w-2.5"
                    style={{ boxShadow: CAL_EDGE_ATTENDANCE }}
                    aria-hidden
                  />
                  <span className="font-medium text-ink">Clase</span>
                </span>
                <span className="shrink-0 text-muted" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[8px] text-ink sm:gap-1.5 sm:text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 sm:h-2.5 sm:w-2.5" aria-hidden />
                  <span className="font-medium text-ink">Acceso libre</span>
                </span>
                <span className="shrink-0 text-muted" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[8px] text-ink sm:gap-1.5 sm:text-[11px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-amber-400 sm:h-2.5 sm:w-2.5"
                    style={{ boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.4)' }}
                    aria-hidden
                  />
                  <span className="font-medium text-ink">Pago clase</span>
                </span>
                <span className="shrink-0 text-muted" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[8px] text-ink sm:gap-1.5 sm:text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 sm:h-2.5 sm:w-2.5" aria-hidden />
                  <span className="font-medium text-ink">Pago acceso libre</span>
                </span>
                <span className="shrink-0 text-muted" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-0.5 text-[8px] text-ink sm:gap-1.5 sm:text-[11px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-indigo-400 sm:h-2.5 sm:w-2.5"
                    style={{ boxShadow: '0 0 0 1px rgba(129, 140, 248, 0.4)' }}
                    aria-hidden
                  />
                  <span className="font-medium leading-tight text-ink sm:whitespace-nowrap">
                    <span className="sm:hidden">Horarios</span>
                    <span className="hidden sm:inline">Horarios posibles</span>
                  </span>
                </span>
                <span className="shrink-0 text-muted" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-0.5 text-[8px] text-ink sm:gap-1.5 sm:text-[11px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-rose-400 sm:h-2.5 sm:w-2.5"
                    aria-hidden
                  />
                  <span className="font-medium text-ink">Vencimiento</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 sm:gap-1">
          <div className="grid shrink-0 grid-cols-7 gap-0.5 sm:gap-1">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label) => (
              <div
                key={label}
                className="py-0.5 text-[10px] font-semibold leading-none text-muted sm:text-[11px]"
              >
                {label}
              </div>
            ))}
          </div>

          <div
            className="grid min-h-0 flex-1 grid-cols-7 gap-0.5 sm:gap-1"
            style={{
              // `auto` en lugar de `1fr`: en móvil el contenedor flex a menudo no tiene alto fijo y las filas 1fr quedan aplastadas.
              gridTemplateRows: `repeat(${numWeekRows}, minmax(3.5rem, auto))`,
            }}
          >
            {loading
              ? Array.from({ length: totalGridCells }).map((_, i) => (
                  <div
                    key={i}
                    className="min-h-0 animate-pulse rounded-md border border-line bg-bg"
                  />
                ))
              : null}
            {!loading &&
              Array.from({ length: leadEmpty }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-0 min-w-0" aria-hidden />
              ))}
            {!loading &&
              days.map((date) => {
                const dayNum = date.getDate()
                const pays = paymentsOnDay(date)
                const atts = attendancesOnDay(date)
                const classAtts = atts.filter((a) => !isMuroCheckin(a))
                const muroAtts = atts.filter((a) => isMuroCheckin(a))
                const classPayItems = pays.filter((p) => !isUnlimitedPack(p.pack_type, classPacks))
                const muroPayItems = pays.filter((p) => isUnlimitedPack(p.pack_type, classPacks))
                const possibleLabels = showPossibleSlots(date)
                  ? getSlotLabelsForWeekday(schedule, date.getDay(), scheduleSlotKey)
                  : []
                const isToday = startOfLocalDay(date).getTime() === todayStart.getTime()
                const hasAttendance = atts.length > 0
                const expiryOnDay = isExpiryDay(date)
                const hasContent = pays.length > 0 || atts.length > 0 || possibleLabels.length > 0 || expiryOnDay

                const cellEdgeStyle =
                  isToday
                    ? { boxShadow: CAL_EDGE_TODAY }
                    : hasAttendance
                      ? { boxShadow: CAL_EDGE_ATTENDANCE }
                      : undefined

                return (
                  <div
                    key={dayNum}
                    style={cellEdgeStyle}
                    className={`flex min-h-0 h-full min-w-0 flex-col rounded-md border border-solid p-1 text-left sm:p-1.5 ${
                      hasAttendance
                        ? 'border-sky-500/40 border-l-[3px] border-l-sky-400 bg-sky-950/40'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <span className="shrink-0 text-center text-xs font-semibold leading-none text-ink sm:text-sm">
                      {dayNum}
                    </span>
                    <div className="mt-1 flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden text-[8px] leading-snug text-ink sm:text-[9px]">
                      {!hasContent && (
                        <span className="flex flex-1 items-center justify-center text-[9px] text-muted sm:text-[10px]">
                          —
                        </span>
                      )}
                      {classPayItems.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-start gap-0.5 rounded bg-amber-950/40 px-0.5 py-0.5 text-amber-400"
                          title={`Pago: ${packShortLabel(p.pack_type, classPacks)}`}
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          <span className="break-words">
                            {formatClock(p.paid_at)}
                            {packShortLabel(p.pack_type, classPacks) && (
                              <span className="ml-0.5 opacity-70">
                                {' · '}{packShortLabel(p.pack_type, classPacks)}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {muroPayItems.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-start gap-0.5 rounded bg-violet-950/40 px-0.5 py-0.5 text-violet-400"
                          title="Pago acceso libre"
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                          <span className="break-words">
                            {formatClock(p.paid_at)}
                            <span className="ml-0.5 opacity-70">{' · '}Muro</span>
                          </span>
                        </div>
                      ))}
                      {classAtts.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-start gap-0.5 rounded-md border border-solid border-sky-500/40 bg-sky-950/40 px-0.5 py-0.5 font-semibold text-sky-400 sm:px-1"
                          title="Asistencia clase"
                        >
                          <span
                            className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400"
                            style={{ boxShadow: CAL_EDGE_ATTENDANCE }}
                          />
                          <span className="break-words">{formatClock(a.attended_at)}</span>
                        </div>
                      ))}
                      {muroAtts.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-start gap-0.5 rounded-md border border-solid border-emerald-500/40 bg-emerald-950/40 px-0.5 py-0.5 font-semibold text-emerald-400 sm:px-1"
                          title="Acceso libre"
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <span className="break-words">{formatClock(a.attended_at)}</span>
                        </div>
                      ))}
                      {possibleLabels.map((label) => (
                        <div
                          key={label}
                          className="flex items-start gap-0.5 rounded bg-indigo-950/40 px-0.5 py-0.5 text-indigo-400"
                          title="Horario posible con cupo"
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                          <span className="break-words">{label}</span>
                        </div>
                      ))}
                      {expiryOnDay && (
                        <div
                          className="flex items-start gap-0.5 rounded bg-rose-950/40 px-0.5 py-0.5 font-semibold text-rose-400"
                          title="El pack vence este día"
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                          <span>Vence</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </div>
  )
}

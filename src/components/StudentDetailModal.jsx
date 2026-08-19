import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { formatDate } from '../utils/dateFormatting'
import { getPackById, getScheduleTypeById, isUnlimitedPack } from '../constants/packs'
import { computeAttendancePolicy, inclusiveCycleEndLabel } from '../utils/attendancePolicy'

const GYM_TZ = 'America/Argentina/Buenos_Aires'

// ─── Date helpers ──────────────────────────────────────────────────────────────

function parseUtc(iso) {
  if (!iso) return null
  const s = String(iso).trim()
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function mondayFirstOffset(d) {
  return (d.getDay() + 6) % 7
}

function sameLocalCalendarDay(iso, date) {
  if (!iso) return false
  const d = parseUtc(iso)
  if (!d) return false
  const isoDay = d.toLocaleDateString('en-CA', { timeZone: GYM_TZ })
  const cellDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return isoDay === cellDay
}

function formatMonthYearES(d) {
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Schedule helpers (same logic as StudentCalendar) ─────────────────────────

const DAY_NAME_TO_JS = {
  lunes: 1,
  martes: 2,
  'miércoles': 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  'sábado': 6,
  sabado: 6,
  domingo: 0,
}

function parseDays(daysStr) {
  const result = []
  const lower = (daysStr ?? '').toLowerCase()
  Object.entries(DAY_NAME_TO_JS).forEach(([name, jsDay]) => {
    if (lower.includes(name) && !result.includes(jsDay)) result.push(jsDay)
  })
  return result
}

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
    if (filterDays !== null && (slot.days !== filterDays || slot.time !== filterTime)) continue
    const days = parseDays(slot.days)
    if (!days.includes(jsDay)) continue
    const label = (slot.time ?? '').trim() || '—'
    if (!seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }
  return labels
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function StudentDetailCalendar({ attendances, policy, classPacks, scheduleTypes }) {
  const [viewYM, setViewYM] = useState(() => {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth() }
  })

  const currentPayment = policy.currentPayment
  const schedule = currentPayment
    ? getScheduleTypeById(currentPayment.schedule_type, scheduleTypes)
    : null
  const scheduleSlotKey = currentPayment?.schedule_slot ?? null
  const isUnlimited = isUnlimitedPack(currentPayment?.pack_type, classPacks)
  const packClassesCap = currentPayment
    ? (getPackById(currentPayment.pack_type, classPacks)?.classes_per_month ?? 0)
    : 0
  const remainingForSlots = isUnlimited || packClassesCap <= 0 ? null : policy.remainingClasses

  const cycleEndExclusive = policy.validUntil ? new Date(policy.validUntil) : null
  const packPaidAt = currentPayment?.paid_at ? parseUtc(currentPayment.paid_at) : null
  const cycleEndLocalDay = cycleEndExclusive
    ? cycleEndExclusive.toLocaleDateString('en-CA', { timeZone: GYM_TZ })
    : null

  const realNow = new Date()
  const todayStart = startOfLocalDay(realNow)
  const isViewingCurrentMonth =
    viewYM.y === realNow.getFullYear() && viewYM.m === realNow.getMonth()

  const displayRef = new Date(viewYM.y, viewYM.m, 1)
  const daysInMonth = new Date(viewYM.y, viewYM.m + 1, 0).getDate()
  const leadEmpty = mondayFirstOffset(displayRef)
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(viewYM.y, viewYM.m, i + 1))
  const numWeekRows = Math.ceil((leadEmpty + daysInMonth) / 7)

  function shiftMonth(delta) {
    setViewYM(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  function dayInPackValidity(date) {
    if (!cycleEndExclusive || !packPaidAt) return false
    const dayStart = startOfLocalDay(date)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)
    return dayEnd >= packPaidAt && dayStart < cycleEndExclusive
  }

  function isExpiryDay(date) {
    if (!cycleEndLocalDay) return false
    const cellDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return cellDay === cycleEndLocalDay
  }

  function getPossibleLabels(date) {
    if (!schedule?.slots?.length) return []
    if (!dayInPackValidity(date)) return []
    const dayStart = startOfLocalDay(date)
    if (dayStart.getTime() < todayStart.getTime()) return []
    if (remainingForSlots !== null && remainingForSlots <= 0) return []
    return getSlotLabelsForWeekday(schedule, date.getDay(), scheduleSlotKey)
  }

  return (
    <div>
      {/* Vencimiento banner */}
      {policy.validUntil && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[10px] text-rose-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
          <span>
            Pack activo —{' '}
            <span className="font-semibold">
              vence el {inclusiveCycleEndLabel(policy.validUntil)}
            </span>
          </span>
        </div>
      )}

      {/* Navegación */}
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-sm font-medium text-ink shadow-sm hover:bg-bg"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <p className="min-w-0 flex-1 text-center text-xs font-semibold capitalize text-ink">
          {formatMonthYearES(displayRef)}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-sm font-medium text-ink shadow-sm hover:bg-bg"
          aria-label="Mes siguiente"
        >
          ›
        </button>
        {!isViewingCurrentMonth && (
          <button
            type="button"
            className="ml-1 rounded-md border border-brand-500/40 bg-brand-900/25 px-2 py-0.5 text-[10px] font-medium text-brand-400 hover:bg-brand-900/35"
            onClick={() => {
              const n = new Date()
              setViewYM({ y: n.getFullYear(), m: n.getMonth() })
            }}
          >
            Hoy
          </button>
        )}
      </div>

      {/* Referencia */}
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-lg border border-line bg-bg px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[9px] text-ink">
          <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400" />
          Asistencia
        </span>
        <span className="text-muted" aria-hidden>·</span>
        <span className="inline-flex items-center gap-1 text-[9px] text-ink">
          <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
          Horarios posibles
        </span>
        <span className="text-muted" aria-hidden>·</span>
        <span className="inline-flex items-center gap-1 text-[9px] text-ink">
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
          Vencimiento
        </span>
      </div>

      {/* Grilla */}
      <div className="grid grid-cols-7 gap-0.5">
        {DOW_LABELS.map((d) => (
          <div key={d} className="py-0.5 text-center text-[10px] font-semibold text-muted">
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-0.5"
        style={{ gridTemplateRows: `repeat(${numWeekRows}, minmax(3rem, auto))` }}
      >
        {Array.from({ length: leadEmpty }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {days.map((date) => {
          const dayStart = startOfLocalDay(date)
          const isToday = dayStart.getTime() === todayStart.getTime()
          const atts = attendances.filter((a) => sameLocalCalendarDay(a.attended_at, date))
          const hasAttendance = atts.length > 0
          const possibleLabels = getPossibleLabels(date)
          const expiryOnDay = isExpiryDay(date)
          const hasContent = hasAttendance || possibleLabels.length > 0 || expiryOnDay

          return (
            <div
              key={date.getDate()}
              style={isToday ? { boxShadow: '0 0 0 2px var(--color-brand-500)' } : undefined}
              className={`flex min-h-0 flex-col rounded-md border p-1 text-left ${
                hasAttendance
                  ? 'border-l-2 border-sky-500/40 border-l-sky-400 bg-sky-950/40'
                  : isToday
                    ? 'border-brand-500/40 bg-brand-900/20'
                    : 'border-line bg-surface'
              }`}
            >
              <span
                className={`shrink-0 text-center text-[10px] font-semibold leading-none sm:text-xs ${
                  isToday ? 'text-brand-600' : 'text-ink'
                }`}
              >
                {date.getDate()}
              </span>
              <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden text-[7px] leading-snug sm:text-[8px]">
                {!hasContent && (
                  <span className="flex flex-1 items-center justify-center text-[8px] text-muted">
                    —
                  </span>
                )}
                {atts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-0.5 rounded bg-sky-950/40 px-0.5 font-semibold text-sky-400"
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    <span>Asistencia</span>
                  </div>
                ))}
                {possibleLabels.map((label) => (
                  <div
                    key={label}
                    className="flex items-start gap-0.5 rounded bg-indigo-950/40 px-0.5 text-indigo-400"
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                    <span>{label}</span>
                  </div>
                ))}
                {expiryOnDay && (
                  <div className="flex items-start gap-0.5 rounded bg-rose-950/40 px-0.5 font-semibold text-rose-400">
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
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

/**
 * Modal de detalle de alumno. Funciona en contexto admin (con acciones) y coach (solo lectura).
 *
 * Props:
 *   student        — objeto mínimo con { id, name, email, blocked? }
 *   isAdmin        — muestra footer con acciones admin
 *   onClose        — cerrar modal
 *   onRegisterPayment(student) — admin: abrir flujo de pago
 *   onBlockStudent(student)    — admin: abrir confirm suspender/desuspender
 *   onDeleteStudent(student)   — admin: abrir confirm eliminar
 */
export function StudentDetailModal({
  student,
  isAdmin = false,
  onClose,
  onRegisterPayment,
  onBlockStudent,
  onDeleteStudent,
}) {
  const { classPacks, scheduleTypes } = useGymCatalog()
  const [payments, setPayments] = useState([])
  const [attendances, setAttendances] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student?.id) return
    let active = true
    ;(async () => {
      setLoading(true)
      const eighteenAgo = new Date()
      eighteenAgo.setMonth(eighteenAgo.getMonth() - 18)

      const [pmRes, attRes] = await Promise.all([
        supabase
          .from('payments')
          .select('id, pack_type, schedule_type, schedule_slot, paid_at, amount')
          .eq('student_id', student.id)
          .gte('paid_at', eighteenAgo.toISOString())
          .order('paid_at', { ascending: false }),
        // Sin límite numérico: se usa para el calendario completo mes a mes
        supabase
          .from('attendances')
          .select('id, attended_at, checkin_method')
          .eq('student_id', student.id)
          .gte('attended_at', eighteenAgo.toISOString())
          .order('attended_at', { ascending: false }),
      ])

      if (!active) return
      setPayments(pmRes.data ?? [])
      setAttendances(attRes.data ?? [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [student?.id])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const policy = computeAttendancePolicy({ payments, attendances, classPacks })
  const currentPayment = policy.currentPayment
  const currentPack = currentPayment ? getPackById(currentPayment.pack_type, classPacks) : null
  const currentSchedule = currentPayment
    ? getScheduleTypeById(currentPayment.schedule_type, scheduleTypes)
    : null
  const isUnlimited = isUnlimitedPack(currentPayment?.pack_type, classPacks)

  const total = policy.classesTotalForCurrentCycle || 0
  const used = policy.currentUsed || 0
  const remaining = policy.remainingClasses
  const progressPct = total > 0 ? Math.min((used / total) * 100, 100) : 0

  const expiryLabel =
    currentPayment && policy.validUntil ? inclusiveCycleEndLabel(policy.validUntil) : null
  const paymentDateLabel = currentPayment?.paid_at ? formatDate(currentPayment.paid_at) : null

  const slotLabel = (() => {
    if (!currentPayment) return null
    if (currentPayment.schedule_slot) {
      const [days, time] = currentPayment.schedule_slot.split('|')
      return `${days} · ${time}`
    }
    if (currentSchedule?.slots?.length === 1) {
      const s = currentSchedule.slots[0]
      return `${s.days} · ${s.time}`
    }
    return null
  })()

  const initials = (student.name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const statusCls = student.blocked
    ? 'border-amber-500/40 bg-amber-950/40 text-amber-400'
    : currentPayment
      ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400'
      : 'border-line bg-surface text-muted'
  const statusLabel = student.blocked ? 'Suspendido' : currentPayment ? 'Activo' : 'Sin plan activo'

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className="flex w-full flex-col rounded-t-lg border border-line bg-surface sm:max-w-lg sm:rounded-lg"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-bg">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{student.name}</p>
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${statusCls}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-xs text-muted">{student.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1 text-muted hover:bg-surface hover:text-muted"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-surface" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {/* Pack actual */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Pack actual
                </p>
                {currentPack ? (
                  <div className="rounded-xl border border-line bg-bg p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink">{currentPack.name}</p>
                        {currentSchedule && (
                          <p className="text-xs text-muted">{currentSchedule.name}</p>
                        )}
                        {slotLabel && (
                          <p className="text-[11px] font-medium text-brand-600">{slotLabel}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {paymentDateLabel && (
                          <p className="text-[11px] text-muted">
                            Pago:{' '}
                            <span className="font-medium text-ink">{paymentDateLabel}</span>
                          </p>
                        )}
                        {expiryLabel && (
                          <p className="text-[11px] text-muted">
                            Vence:{' '}
                            <span className="font-medium text-ink">{expiryLabel}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    {!isUnlimited && total > 0 && (
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-[10px] text-muted">
                          <span>{used} usadas</span>
                          <span>
                            {remaining ?? 0} restantes / {total}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {isUnlimited && (
                      <p className="mt-1 text-[11px] font-medium text-emerald-400">
                        Acceso ilimitado
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-line bg-bg p-3">
                    <p className="text-xs text-muted">Sin plan activo este mes.</p>
                    {policy.latestQualifyingPayment && (
                      <p className="mt-1 text-[11px] text-muted">
                        Último pago: {formatDate(policy.latestQualifyingPayment.paid_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Calendario */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Calendario
                </p>
                <div className="rounded-xl border border-line bg-bg p-3">
                  <StudentDetailCalendar
                    attendances={attendances}
                    policy={policy}
                    classPacks={classPacks}
                    scheduleTypes={scheduleTypes}
                  />
                </div>
              </div>

              {/* Historial de pagos */}
              {payments.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Historial de pagos
                  </p>
                  <ul className="space-y-1.5">
                    {payments.slice(0, 8).map((p) => {
                      const pack = getPackById(p.pack_type, classPacks)
                      const sched = getScheduleTypeById(p.schedule_type, scheduleTypes)
                      const slot = p.schedule_slot
                        ? (() => {
                            const [days, time] = p.schedule_slot.split('|')
                            return `${days} · ${time}`
                          })()
                        : sched?.slots?.length === 1
                          ? `${sched.slots[0].days} · ${sched.slots[0].time}`
                          : null
                      return (
                        <li
                          key={p.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{pack?.name ?? p.pack_type}</p>
                            {sched && (
                              <p className="text-muted">
                                {sched.name}
                                {slot ? ` · ${slot}` : ''}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-medium text-ink">{formatDate(p.paid_at)}</p>
                            {p.amount != null && (
                              <p className="text-muted">
                                ${Number(p.amount).toLocaleString('es-AR')}
                              </p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {payments.length === 0 && (
                <p className="text-center text-xs text-muted">
                  Sin pagos registrados en los últimos 18 meses.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer acciones admin */}
        {isAdmin && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-line bg-bg/60 px-4 py-3">
            {onRegisterPayment && (
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-xs"
                onClick={() => onRegisterPayment(student)}
              >
                Registrar pago
              </button>
            )}
            {onBlockStudent && (
              <button
                type="button"
                className={
                  student.blocked
                    ? 'rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600'
                    : 'rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600'
                }
                onClick={() => onBlockStudent(student)}
              >
                {student.blocked ? 'Desuspender' : 'Suspender'}
              </button>
            )}
            {onDeleteStudent && (
              <button
                type="button"
                className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                onClick={() => onDeleteStudent(student)}
              >
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

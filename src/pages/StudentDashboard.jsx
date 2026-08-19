import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isUnlimitedPack } from '../constants/packs'
import {
  computeAttendancePolicy,
  inclusiveCycleEndLabel,
} from '../utils/attendancePolicy'
import { toSpanishError } from '../utils/errors'
import { formatDateTime, formatDate, formatDateLong } from '../utils/dateFormatting'

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

function parseDays(daysStr) {
  const result = new Set()
  const lower = (daysStr ?? '').toLowerCase()
  Object.entries(DAY_NAME_TO_JS).forEach(([name, jsDay]) => {
    if (lower.includes(name)) result.add(jsDay)
  })
  return [...result]
}

function parseTime(timeStr) {
  const part = (timeStr ?? '').split(/[\s–-]+/)[0]?.trim() ?? ''
  const [h, m] = part.split(':').map(Number)
  return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m]
}

function getNextClassDateTime(schedule, validUntil = null, scheduleSlotKey = null) {
  if (!schedule?.slots?.length) return null
  const now = new Date()

  let filterDays = null
  let filterTime = null
  if (scheduleSlotKey) {
    const sep = scheduleSlotKey.indexOf('|')
    if (sep !== -1) {
      filterDays = scheduleSlotKey.slice(0, sep)
      filterTime = scheduleSlotKey.slice(sep + 1)
    }
  }

  let next = null
  for (const slot of schedule.slots) {
    if (filterDays !== null && (slot.days !== filterDays || slot.time !== filterTime)) continue
    const days = parseDays(slot.days)
    const [hour, minute] = parseTime(slot.time)
    for (const targetDay of days) {
      const candidate = new Date(now)
      candidate.setHours(hour, minute, 0, 0)
      const currentDay = candidate.getDay()
      let diff = targetDay - currentDay
      if (diff < 0) diff += 7
      if (diff === 0 && candidate <= now) diff = 7
      candidate.setDate(candidate.getDate() + diff)
      const candidateDayStart = new Date(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate(),
        0, 0, 0, 0,
      )
      if (validUntil && candidateDayStart >= validUntil) continue
      if (!next || candidate < next) next = candidate
    }
  }
  return next
}

export function StudentDashboardPage() {
  const { profile } = useAuth()
  const { classPacks, scheduleTypes, walkIn, gymName } = useGymCatalog()
  const [summary, setSummary] = useState(null)
  const [lastAttendance, setLastAttendance] = useState(null)
  const [lastMuroAttendance, setLastMuroAttendance] = useState(null)
  const [nextClass, setNextClass] = useState(null)
  const [classValidUntil, setClassValidUntil] = useState(null)
  const [muroValidUntil, setMuroValidUntil] = useState(null)
  const [nextCourse, setNextCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSummary = useCallback(
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
        const dataFrom = new Date()
        dataFrom.setMonth(dataFrom.getMonth() - 18)

        const coursesPromise = profile?.gym_id
          ? supabase
              .from('courses')
              .select('id, name, start_date')
              .eq('gym_id', profile.gym_id)
              .gte('start_date', new Date().toISOString().slice(0, 10))
              .order('start_date', { ascending: true })
              .limit(1)
              .maybeSingle()
              .then((r) => ({ data: r.data, error: r.error }))
              .catch(() => ({ data: null, error: true }))
          : Promise.resolve({ data: null, error: null })

        const [
          { data: subData, error: subError },
          { data: attendanceRows, error: attError },
          { data: paymentRows, error: paymentsError },
          { data: lastAtt, error: lastAttError },
          { data: coursesData, error: coursesError },
        ] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('id, plans ( id, name, classes_per_month )')
            .eq('student_id', profile.id)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('attendances')
            .select('id, attended_at, checkin_method')
            .eq('student_id', profile.id)
            .gte('attended_at', dataFrom.toISOString()),
          supabase
            .from('payments')
            .select('id, pack_type, schedule_type, schedule_slot, paid_at')
            .eq('student_id', profile.id)
            .gte('paid_at', dataFrom.toISOString())
            .order('paid_at', { ascending: false })
            .limit(24),
          supabase
            .from('attendances')
            .select('attended_at, checkin_method')
            .eq('student_id', profile.id)
            .order('attended_at', { ascending: false })
            .limit(10),
          coursesPromise,
        ])

        if (subError) throw subError
        if (attError) throw attError
        if (paymentsError) throw paymentsError
        if (lastAttError) throw lastAttError

        // Separate class check-ins from muro libre check-ins
        const isMuroCheckin = (a) =>
          a.checkin_method === 'qr_muro_libre' || a.checkin_method === 'manual_muro_libre'

        const classAttendances = (attendanceRows ?? []).filter((a) => !isMuroCheckin(a))
        const muroAttendances = (attendanceRows ?? []).filter((a) => isMuroCheckin(a))

        // Compute two independent policies
        const classPayments = (paymentRows ?? []).filter((p) => !isUnlimitedPack(p.pack_type, classPacks))
        const muroPayments = (paymentRows ?? []).filter((p) => isUnlimitedPack(p.pack_type, classPacks))

        const classPolicy = computeAttendancePolicy({
          payments: classPayments,
          attendances: classAttendances,
          classPacks,
          walkIn,
        })
        const muroPolicy = computeAttendancePolicy({
          payments: muroPayments,
          attendances: muroAttendances,
          classPacks,
          walkIn,
        })

        const latestClassPayment = classPolicy.currentPayment ?? classPolicy.latestQualifyingPayment ?? null
        const hasMuro = muroPolicy.hasQr && muroPolicy.validUntil && new Date() < new Date(`${muroPolicy.validUntil}Z`.replace('ZZ', 'Z'))

        const packFromPayment = latestClassPayment
          ? classPacks.find((p) => p.id === latestClassPayment.pack_type)
          : null
        const schedule = latestClassPayment
          ? scheduleTypes.find((s) => s.id === latestClassPayment.schedule_type) ?? null
          : null

        // Next class: only show when the payment is active and there are remaining classes,
        // consistent with how the calendar shows possible slots.
        const activeClassSchedule = classPolicy.currentPayment
          ? scheduleTypes.find((s) => s.id === classPolicy.currentPayment.schedule_type) ?? null
          : null
        const hasRemainingClasses =
          classPolicy.remainingClasses === null || (classPolicy.remainingClasses ?? 0) > 0
        const cycleEnd = classPolicy.validUntil ? new Date(classPolicy.validUntil) : null

        const plan = subData?.plans
        // onlyMuro: student has muro libre but no active class/group plan
        const onlyMuro = !latestClassPayment && hasMuro
        const classesPerMonth = onlyMuro
          ? 0
          : classPolicy.currentPayment
            ? classPolicy.classesTotalForCurrentCycle ||
              packFromPayment?.classes_per_month ||
              plan?.classes_per_month ||
              0
            : packFromPayment?.classes_per_month ?? plan?.classes_per_month ?? 0
        const usedInPeriod = onlyMuro ? 0 : classPolicy.currentUsed
        const remaining = onlyMuro ? null : (classPolicy.remainingClasses ?? 0)

        const planName = latestClassPayment
          ? (packFromPayment?.name ?? plan?.name ?? 'Sin plan')
          : hasMuro
            ? 'Mensualidad muro libre'
            : (plan?.name ?? 'Sin plan')

        setSummary({ planName, classesPerMonth, usedThisMonth: usedInPeriod, remaining, onlyMuro })

        const lastClassRow = (lastAtt ?? []).find((a) => !isMuroCheckin(a))
        const lastMuroRow = (lastAtt ?? []).find((a) => isMuroCheckin(a))
        setLastAttendance(lastClassRow?.attended_at ?? null)
        setLastMuroAttendance(lastMuroRow?.attended_at ?? null)

        setNextClass(
          activeClassSchedule && hasRemainingClasses
            ? getNextClassDateTime(
                activeClassSchedule,
                cycleEnd,
                classPolicy.currentPayment?.schedule_slot ?? null,
              )
            : null,
        )

        setClassValidUntil(classPolicy.validUntil ?? null)
        setMuroValidUntil(hasMuro ? muroPolicy.validUntil : null)

        if (coursesData && !coursesError) {
          setNextCourse(coursesData)
        } else {
          setNextCourse(null)
        }
      } catch (err) {
        setError(toSpanishError(err, 'No se pudo cargar tu resumen'))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [profile, classPacks, scheduleTypes, walkIn],
  )

  useEffect(() => {
    let active = true

    async function run() {
      if (!active) return
      await loadSummary()
    }

    run()

    return () => {
      active = false
    }
  }, [loadSummary])

  useEffect(() => {
    if (!profile) return undefined
    const channel = supabase
      .channel(`student-dashboard-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `student_id=eq.${profile.id}` },
        () => loadSummary(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `student_id=eq.${profile.id}` },
        () => loadSummary(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendances', filter: `student_id=eq.${profile.id}` },
        () => loadSummary(true),
      )
      .subscribe((status) => {
        // Útil cuando el canal se reconecta: vuelve a sincronizar el resumen.
        if (status === 'SUBSCRIBED') {
          loadSummary(true)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, loadSummary])

  useEffect(() => {
    // Fallback para evitar vistas desactualizadas si Realtime falla temporalmente.
    const intervalId = window.setInterval(() => {
      loadSummary(true)
    }, 10_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadSummary])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSummary(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadSummary])

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-base font-semibold text-ink sm:text-lg">
          Hola{profile?.name ? `, ${profile.name}` : ''}
        </h1>
        <p className="text-xs text-muted">
          Resumen de tu actividad en {gymName}.
        </p>
      </div>

      {error && (
        <p className="shrink-0 rounded border border-red-500/40 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-400">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="card col-span-2 p-3 sm:col-span-1 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Tu plan
          </p>
          {loading ? (
            <div className="mt-2 h-6 w-24 animate-pulse rounded bg-surface" />
          ) : (
            <p className="mt-1 text-base font-semibold text-ink">
              {summary?.planName ?? '—'}
            </p>
          )}
        </div>

        <div className="card p-3 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Clases en el período
          </p>
          {loading ? (
            <div className="mt-2 h-6 w-20 animate-pulse rounded bg-surface" />
          ) : (
            <p className="mt-1 text-base font-semibold text-ink">
              {summary != null
                ? summary.onlyMuro
                  ? '∞'
                  : `${summary.usedThisMonth} / ${summary.classesPerMonth || '—'}`
                : '—'}
            </p>
          )}
        </div>

        <div className="card p-3 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Clases restantes
          </p>
          {loading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-surface" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-brand-600">
              {summary?.onlyMuro ? '∞' : (summary?.remaining ?? '—')}
            </p>
          )}
        </div>

        {classValidUntil && (
          <div className="card col-span-2 p-3 sm:col-span-1 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Vigencia del pack
            </p>
            {loading ? (
              <div className="mt-2 h-6 w-28 animate-pulse rounded bg-surface" />
            ) : (
              <p className="mt-1 text-sm font-medium text-ink">
                Válido hasta {inclusiveCycleEndLabel(classValidUntil)}
              </p>
            )}
          </div>
        )}

        {muroValidUntil && (
          <div className="card col-span-2 p-3 sm:col-span-1 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Muro libre mensual
            </p>
            {loading ? (
              <div className="mt-2 h-6 w-28 animate-pulse rounded bg-surface" />
            ) : (
              <p className="mt-1 text-sm font-medium text-ink">
                Válido hasta {inclusiveCycleEndLabel(muroValidUntil)}
              </p>
            )}
          </div>
        )}

        {lastAttendance != null && (
          <div className="card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Última clase
            </p>
            <p className="mt-1 text-xs font-medium text-ink sm:text-sm">
              {formatDateTime(lastAttendance)}
            </p>
          </div>
        )}
        {lastMuroAttendance != null && (
          <div className="card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Último muro libre
            </p>
            <p className="mt-1 text-xs font-medium text-ink sm:text-sm">
              {formatDateTime(lastMuroAttendance)}
            </p>
          </div>
        )}

        {nextClass && (
          <div className="card col-span-2 p-3 sm:col-span-1 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Próxima clase
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {nextClass.toLocaleDateString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}

        {nextCourse && (
          <div className="card col-span-2 p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Próximo curso
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {nextCourse.name}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDateLong(nextCourse.start_date)}
            </p>
            <Link
              to="/app/courses"
              className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-400"
            >
              Ver cursos →
            </Link>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <Link to="/app/qr" className="btn-secondary px-4 py-2 text-sm">
          QR Clases/Grupo
        </Link>
        <Link to="/app/walkin-qr" className="btn-secondary px-4 py-2 text-sm">
          QR Acceso libre
        </Link>
      </div>
    </div>
  )
}

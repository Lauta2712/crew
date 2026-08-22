import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isUnlimitedPack, isWalkInSchedule } from '../constants/packs'
import { computeAttendancePolicy, inclusiveCycleEndLabel } from '../utils/attendancePolicy'
import { formatTime } from '../utils/dateFormatting'

/**
 * Parsea un timestamp de Supabase (puede venir sin zona horaria) a Date UTC,
 * igual que parseDbDate en attendancePolicy.js.
 */
function parseDbDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(raw)
  const d = new Date(hasTz ? raw : `${raw}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function StudentWalkInQrPage() {
  const { profile } = useAuth()
  const { classPacks, walkIn } = useGymCatalog()
  const unlimitedPackId = classPacks.find((p) => p.unlimited)?.id ?? null
  const [qrState, setQrState] = useState({
    loading: true,
    hasQr: false,
    validUntil: null,
    isDayPass: false,
    todayVisits: [],
  })

  const loadQrState = useCallback(
    async (silent = false) => {
      if (!profile) return
      if (!silent) setQrState((s) => ({ ...s, loading: true }))
      try {
        const dataFrom = new Date()
        dataFrom.setMonth(dataFrom.getMonth() - 18)

        const [{ data: payments, error: paymentsError }, { data: attendances, error: attError }] =
          await Promise.all([
            supabase
              .from('payments')
              .select('id, paid_at, pack_type, schedule_type')
              .eq('student_id', profile.id)
              .gte('paid_at', dataFrom.toISOString())
              .order('paid_at', { ascending: false })
              .limit(48),
            supabase
              .from('attendances')
              .select('id, attended_at, checkin_method')
              .eq('student_id', profile.id)
              .gte('attended_at', dataFrom.toISOString())
              .order('attended_at', { ascending: false })
              .limit(120),
          ])

        if (paymentsError) throw paymentsError
        if (attError) throw attError

        const allPayments = payments ?? []
        const allAttendances = attendances ?? []

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date()
        todayEnd.setHours(23, 59, 59, 999)

        // Visitas de acceso libre registradas hoy (checkin_method = qr_muro_libre o manual_muro_libre)
        const todayVisits = allAttendances.filter((a) => {
          if (a.checkin_method !== 'qr_muro_libre' && a.checkin_method !== 'manual_muro_libre') return false
          const d = parseDbDate(a.attended_at)
          return d && d >= todayStart && d <= todayEnd
        })

        // --- Pase mensual ---
        const mensualPayments = allPayments.filter((p) => isUnlimitedPack(p.pack_type, classPacks))
        const mensualPolicy = computeAttendancePolicy({
          payments: mensualPayments,
          attendances: allAttendances,
          classPacks,
          walkIn,
        })
        const mensualActive =
          mensualPolicy.hasQr &&
          mensualPolicy.validUntil &&
          new Date() < new Date(mensualPolicy.validUntil)

        if (mensualActive) {
          setQrState({
            loading: false,
            hasQr: true,
            validUntil: mensualPolicy.validUntil,
            isDayPass: false,
            todayVisits,
          })
          return
        }

        // --- Pase diario: cualquier pago en el horario de acceso libre (no mensual) pagado hoy ---
        const hasDayPassToday = allPayments.some((p) => {
          if (isUnlimitedPack(p.pack_type, classPacks)) return false
          if (!isWalkInSchedule(p.schedule_type, walkIn)) return false
          const paidAt = parseDbDate(p.paid_at)
          return paidAt && paidAt >= todayStart && paidAt <= todayEnd
        })

        if (hasDayPassToday) {
          // Si el pase ya fue usado (hay asistencia de acceso libre hoy), desactivar el QR
          const dayPassUsed = todayVisits.length > 0
          setQrState({
            loading: false,
            hasQr: !dayPassUsed,
            validUntil: dayPassUsed ? null : todayEnd.toISOString(),
            isDayPass: true,
            todayVisits,
          })
          return
        }

        setQrState({ loading: false, hasQr: false, validUntil: null, isDayPass: false, todayVisits })
      } catch {
        setQrState((s) => ({ ...s, loading: false }))
      }
    },
    [profile, classPacks, walkIn],
  )

  useEffect(() => {
    loadQrState()
  }, [loadQrState])

  useEffect(() => {
    if (!profile) return undefined
    const channel = supabase
      .channel(`student-walkin-qr-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `student_id=eq.${profile.id}` },
        () => loadQrState(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendances', filter: `student_id=eq.${profile.id}` },
        () => loadQrState(true),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadQrState(true)
      })
    return () => supabase.removeChannel(channel)
  }, [profile, loadQrState])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadQrState(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadQrState])

  useEffect(() => {
    const id = window.setInterval(() => loadQrState(true), 10_000)
    return () => window.clearInterval(id)
  }, [loadQrState])

  const isActive = qrState.hasQr && qrState.validUntil && new Date() < new Date(qrState.validUntil)

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-ink sm:text-lg">QR Acceso libre</h1>
        <p className="text-xs text-muted">
          Mostrá este QR para fichar en el acceso libre. Es independiente del QR de clases.
        </p>
      </div>

      <div className="card flex flex-col items-center gap-4 p-6">
        {!profile ? (
          <p className="text-sm text-muted">Reiniciá sesión para ver el QR.</p>
        ) : qrState.loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand-500" />
          </div>
        ) : isActive ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Acceso libre</span>
              <span className="rounded-full border border-sky-500/40 bg-sky-950/40 px-2.5 py-0.5 text-xs font-medium text-sky-400">
                {qrState.isDayPass ? 'Pase diario' : 'Activo'}
              </span>
            </div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                JSON.stringify({
                  type: 'attendance',
                  student_id: profile.id,
                  valid_until: qrState.validUntil,
                  pack_type: qrState.isDayPass ? walkIn.dailyPackId : unlimitedPackId,
                  schedule_type_id: walkIn.scheduleId ?? null,
                }),
              )}`}
              alt="QR acceso libre"
              className="h-52 w-52 sm:h-64 sm:w-64"
            />
            <p className="text-xs text-muted">
              {qrState.isDayPass
                ? 'Válido hasta las 23:59 de hoy'
                : `Válido hasta ${inclusiveCycleEndLabel(qrState.validUntil)}`}
            </p>
            {/* Para mensualidad: mostrar entradas registradas hoy (acceso ilimitado) */}
            {!qrState.isDayPass && qrState.todayVisits.length > 0 && (
              <div className="w-full rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                  Entradas registradas hoy
                </p>
                <ul className="space-y-1">
                  {qrState.todayVisits.map((v) => (
                    <li key={v.id} className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {formatTime(v.attended_at)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            {qrState.isDayPass && qrState.todayVisits.length > 0 ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950/40">
                  <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-ink">Pase diario ya utilizado</p>
                <p className="max-w-xs text-xs text-muted">
                  Ya registraste tu asistencia de acceso libre hoy a las{' '}
                  <span className="font-medium text-ink">
                    {formatTime(qrState.todayVisits[0].attended_at)}
                  </span>
                  . Para volver a ingresar, hablá con el profe para registrar un nuevo pase.
                </p>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded bg-surface-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="h-6 w-6 text-muted"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink">Sin acceso a acceso libre hoy</p>
                <p className="max-w-xs text-xs text-muted">
                  El QR se activa cuando tenés un pase diario registrado para hoy, o una mensualidad de
                  acceso libre vigente. Hablá con el profe para registrar el pago.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

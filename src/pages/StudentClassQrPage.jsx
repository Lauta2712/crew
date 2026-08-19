import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isUnlimitedPack } from '../constants/packs'
import { computeAttendancePolicy, inclusiveCycleEndLabel } from '../utils/attendancePolicy'

export function StudentClassQrPage() {
  const { profile } = useAuth()
  const { classPacks, walkIn } = useGymCatalog()
  const [qrState, setQrState] = useState({
    loading: true,
    latestPayment: null,
    validUntil: null,
    hasQr: false,
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
              .limit(24),
            supabase
              .from('attendances')
              .select('id, attended_at')
              .eq('student_id', profile.id)
              .gte('attended_at', dataFrom.toISOString())
              .order('attended_at', { ascending: false })
              .limit(120),
          ])

        if (paymentsError) throw paymentsError
        if (attError) throw attError

        const classPayments = (payments ?? []).filter((p) => !isUnlimitedPack(p.pack_type, classPacks))
        const policy = computeAttendancePolicy({
          payments: classPayments,
          attendances: attendances ?? [],
          classPacks,
          walkIn,
        })

        setQrState({
          loading: false,
          latestPayment: policy.currentPayment ?? null,
          validUntil: policy.validUntil,
          hasQr: policy.hasQr,
        })
      } catch {
        setQrState((s) => ({ ...s, loading: false }))
      }
    },
    [profile, classPacks, walkIn],
  )

  useEffect(() => { loadQrState() }, [loadQrState])

  useEffect(() => {
    if (!profile) return undefined
    const channel = supabase
      .channel(`student-class-qr-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `student_id=eq.${profile.id}` }, () => loadQrState(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances', filter: `student_id=eq.${profile.id}` }, () => loadQrState(true))
      .subscribe((status) => { if (status === 'SUBSCRIBED') loadQrState(true) })
    return () => { supabase.removeChannel(channel) }
  }, [profile, loadQrState])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadQrState(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadQrState])

  useEffect(() => {
    const id = window.setInterval(() => loadQrState(true), 10_000)
    return () => window.clearInterval(id)
  }, [loadQrState])

  const isActive =
    qrState.hasQr &&
    qrState.latestPayment &&
    qrState.validUntil &&
    new Date() < new Date(qrState.validUntil)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-ink sm:text-lg">QR Clases</h1>
        <p className="text-xs text-muted">
          Mostralo al entrenador para registrar tu asistencia a clases o grupo.
        </p>
      </div>

      <div className="card flex flex-col items-center gap-4 p-4 sm:p-6">
        {!profile ? (
          <p className="text-sm text-muted">Reiniciá sesión para ver el QR.</p>
        ) : qrState.loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand-500" />
          </div>
        ) : isActive ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Clases</span>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                Activo
              </span>
            </div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                JSON.stringify({
                  type: 'attendance',
                  student_id: profile.id,
                  valid_until: qrState.validUntil,
                  pack_type: qrState.latestPayment.pack_type,
                }),
              )}`}
              alt="QR asistencia a clases"
              className="h-48 w-48 sm:h-60 sm:w-60"
            />
            <p className="text-xs text-muted">
              Válido hasta{' '}
              <span className="font-medium text-ink">
                {inclusiveCycleEndLabel(qrState.validUntil)}
              </span>
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
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
                  d="M3.75 4.5A.75.75 0 0 1 4.5 3.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5Zm0 10.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5Zm10.5-10.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 17.25h.75v.75h-.75v-.75ZM17.25 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z"
                />
              </svg>
            </div>
            <p className="text-sm font-semibold text-ink">Sin QR activo</p>
            <p className="max-w-xs text-xs text-muted">
              Cuando el entrenador registre tu pago de clases o grupo, el QR aparecerá aquí
              automáticamente.
            </p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted text-center">
        La vigencia es de un mes desde la fecha y hora en que se registró el pago (no el mes calendario).
      </p>
    </div>
  )
}

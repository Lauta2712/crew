import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { StudentTable } from '../components/StudentTable'
import { isUnlimitedPack, PACK4_MENSUAL_NAME } from '../constants/packs'
import { computeAttendancePolicy, inclusiveCycleEndLabel } from '../utils/attendancePolicy'
import { invokeEdgeFunctionWithUserJwt } from '../utils/edgeFunctions'
import { getFunctionsInvokeFailureMessage, toSpanishError } from '../utils/errors'
import { downloadStudentsListCsv } from '../utils/csvExport'
import {
  assertPaymentAllowedThisMonth,
  filterExpiredPackPayments,
  resolveManualPaymentRow,
  shouldSyncSubscriptionAfterManualPayment,
} from '../utils/manualPaymentInsert'
import { formatDateTime } from '../utils/dateFormatting'

export function StudentsPage() {
  const { profile, isAdmin } = useAuth()
  const { classPacks, scheduleTypes, walkIn } = useGymCatalog()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState(null)

  const loadStudents = useCallback(
    async (silent = false) => {
      if (!profile && !silent) return
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      let active = true

      try {
        const paymentFrom = new Date()
        paymentFrom.setMonth(paymentFrom.getMonth() - 18)

        const gymFilter = profile?.gym_id

        let query = supabase
          .from('users')
          .select(
            `
            id,
            name,
            email,
            role,
            gym_id,
            blocked,
            subscriptions (
              id,
              plans (
                id,
                name,
                classes_per_month
              )
            ),
            attendances:attendances (
              id,
              attended_at,
              checkin_method
            )
          `,
          )
          .eq('role', 'student')
          .is('deleted_at', null)

        if (gymFilter) {
          query = query.or(`gym_id.eq.${gymFilter},gym_id.is.null`)
        }

        const { data, error } = await query

        if (error) throw error
        if (!active) return

        const studentsRaw = (data ?? []).filter((student) => student.role === 'student')

        const studentIds = studentsRaw.map((s) => s.id)
        let paymentsByStudent = {}

        if (studentIds.length > 0) {
          const { data: allPayments, error: paymentsError } = await supabase
            .from('payments')
            .select('id, student_id, pack_type, paid_at, schedule_type')
            .in('student_id', studentIds)
            .gte('paid_at', paymentFrom.toISOString())
            .order('paid_at', { ascending: false })

          if (paymentsError) throw paymentsError

          for (const p of allPayments ?? []) {
            if (!paymentsByStudent[p.student_id]) {
              paymentsByStudent[p.student_id] = []
            }
            paymentsByStudent[p.student_id].push(p)
          }
        }

        const enriched =
          studentsRaw.map((student) => {
            const subscription = student.subscriptions?.[0]
            const plan = subscription?.plans
            const studentPayments = paymentsByStudent[student.id] ?? []
            const policy = computeAttendancePolicy({
              payments: studentPayments,
              attendances: student.attendances ?? [],
              classPacks,
            })
            const displayPayment =
              policy.currentPayment ?? policy.latestQualifyingPayment ?? null
            const packFromPayment = displayPayment
              ? classPacks.find((p) => p.id === displayPayment.pack_type)
              : null

            const unlimitedActive = isUnlimitedPack(displayPayment?.pack_type, classPacks)
            const classesPerMonth = unlimitedActive
              ? null
              : policy.currentPayment
                ? policy.classesTotalForCurrentCycle ||
                  packFromPayment?.classes_per_month ||
                  plan?.classes_per_month ||
                  0
                : packFromPayment?.classes_per_month ?? plan?.classes_per_month ?? 0

            const usedInPeriod = policy.currentUsed
            const remaining = unlimitedActive
              ? null
              : (policy.remainingClasses ?? 0)

            const cycleStartIso = policy.windows?.cycleStart
            const usage_cycle_start_label = cycleStartIso && formatDateTime(cycleStartIso)
            const usage_cycle_end_label =
              policy.currentPayment && policy.validUntil
                ? inclusiveCycleEndLabel(policy.validUntil)
                : ''

            return {
              id: student.id,
              name: student.name ?? student.name,
              email: student.email ?? '',
              plan_name: (() => {
                const raw = plan?.name ?? packFromPayment?.name ?? null
                if (raw === PACK4_MENSUAL_NAME || raw === 'Pack de 4 clases') return '4 clases'
                return raw
              })(),
              classes_per_month: classesPerMonth || null,
              classes_used_this_month: usedInPeriod,
              classes_remaining: remaining,
              blocked: !!student.blocked,
              usage_cycle_start_label: usage_cycle_start_label || '',
              usage_cycle_end_label: usage_cycle_end_label || '',
            }
          }) ?? []

        setStudents(enriched)
      } catch (err) {
        if (!active) return
        setError(toSpanishError(err, 'No se pudo cargar la lista de alumnos'))
      } finally {
        if (active && !silent) setLoading(false)
      }
    },
    [profile, classPacks],
  )

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  useEffect(() => {
    const channel = supabase
      .channel('students-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => loadStudents(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => loadStudents(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendances' },
        () => loadStudents(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadStudents])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadStudents(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadStudents])

  useEffect(() => {
    // Fallback: si Realtime no llega, refrescamos cada pocos segundos.
    const intervalId = window.setInterval(() => {
      loadStudents(true)
    }, 10_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadStudents])

  const handleBlockStudent = async (studentId, blocked) => {
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ blocked })
        .eq('id', studentId)
      if (updateError) throw updateError
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, blocked } : s)),
      )
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo actualizar el estado del alumno'))
    }
  }

  const handleDeleteStudent = async (studentId) => {
    setError(null)
    try {
      // Un solo flujo: Edge Function delete-student (borra tablas + public.users + Auth).
      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        'delete-student',
        {
          body: { student_id: studentId },
        },
      )

      if (fnError) {
        const fromFn = await getFunctionsInvokeFailureMessage(fnError, 'delete-student')
        throw new Error(
          fromFn ||
            'Falló la llamada a delete-student. Comprobá que esté desplegada en el mismo proyecto que VITE_SUPABASE_URL.',
        )
      }

      const payload = data && typeof data === 'object' ? data : {}
      if (payload.error) {
        throw new Error(String(payload.error))
      }
      if (!payload.success) {
        throw new Error('La función delete-student no confirmó el borrado.')
      }

      await loadStudents(true)
    } catch (err) {
      setError(
        toSpanishError(
          err,
          'No se pudo eliminar el alumno. Si el mensaje de abajo no alcanza, comprobá que delete-student esté desplegada y que tu usuario sea admin en public.users.',
        ),
      )
    }
  }

  const handleRegisterPayment = async ({
    studentId,
    packId,
    scheduleTypeId,
    scheduleSlot,
    paidAt,
  }) => {
    setPaymentError(null)
    setSavingPayment(true)

    const pack = classPacks.find((p) => p.id === packId) ?? null
    const catalog = { classPacks, walkIn }

    try {
      // Preferimos el Edge Function para que sea atómico/consistente.
      const { error } = await invokeEdgeFunctionWithUserJwt('register-payment', {
        body: {
          student_id: studentId,
          pack_type: packId,
          schedule_type: scheduleTypeId,
          schedule_slot: scheduleSlot ?? null,
          paid_at: paidAt.toISOString(),
        },
      })

      if (error) throw error

      await loadStudents(true)
    } catch (err) {
      // Fallback: lógica previa en frontend (para no romper el flujo
      // si la función no está desplegada aún).
      try {
        if (!pack) throw new Error('Pack inválido.')

        const monthStart = new Date(paidAt.getFullYear(), paidAt.getMonth(), 1)
        const monthEnd = new Date(paidAt.getFullYear(), paidAt.getMonth() + 1, 0, 23, 59, 59, 999)

        const { data: existingPayments, error: existingError } = await supabase
          .from('payments')
          .select('id, schedule_type, pack_type, paid_at')
          .eq('student_id', studentId)
          .gte('paid_at', monthStart.toISOString())
          .lte('paid_at', monthEnd.toISOString())

        if (existingError) throw existingError

        const { data: recentAttendances } = await supabase
          .from('attendances')
          .select('attended_at')
          .eq('student_id', studentId)
          .gte('attended_at', monthStart.toISOString())

        const activePayments = filterExpiredPackPayments(
          existingPayments,
          recentAttendances,
          classPacks,
          paidAt,
        )
        assertPaymentAllowedThisMonth(activePayments, { scheduleId: scheduleTypeId, walkIn })

        const row = await resolveManualPaymentRow(supabase, {
          studentId,
          packId,
          scheduleId: scheduleTypeId,
          scheduleSlot: scheduleSlot ?? null,
          paidAt,
          catalog,
        })

        const { error: insertError } = await supabase.from('payments').insert([row])

        if (insertError) throw insertError

        // Intentar alinear el plan mostrado creando/actualizando una suscripción
        if (
          shouldSyncSubscriptionAfterManualPayment({ scheduleId: scheduleTypeId, walkIn }) &&
          pack.classes_per_month &&
          profile?.gym_id
        ) {
          const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('id')
            .eq('gym_id', profile.gym_id)
            .eq('classes_per_month', pack.classes_per_month)
            .maybeSingle()

          if (planError) {
            // No interrumpimos el flujo: el pago ya se insertó correctamente.
            setPaymentError(
              'El pago se registró, pero no se pudo sincronizar la suscripción: error al buscar el plan.',
            )
          } else if (!plan) {
            setPaymentError(
              `El pago se registró correctamente, pero no se encontró un plan con ${pack.classes_per_month} clases/mes en este gimnasio. La suscripción no fue sincronizada.`,
            )
          }

          if (!planError && plan) {
            const { data: existingSubs } = await supabase
              .from('subscriptions')
              .select('id')
              .eq('student_id', studentId)
              .limit(1)

            if (existingSubs && existingSubs.length > 0) {
              await supabase
                .from('subscriptions')
                .update({
                  plan_id: plan.id,
                  classes_total: pack.classes_per_month,
                  start_date: paidAt.toISOString().slice(0, 10),
                })
                .eq('id', existingSubs[0].id)
            } else {
              await supabase.from('subscriptions').insert([
                {
                  student_id: studentId,
                  plan_id: plan.id,
                  classes_total: pack.classes_per_month,
                  start_date: paidAt.toISOString().slice(0, 10),
                },
              ])
            }
          }
        }

        await loadStudents(true)
      } catch (fallbackErr) {
        setPaymentError(toSpanishError(fallbackErr, 'No se pudo registrar el pago'))
      }
    } finally {
      setSavingPayment(false)
    }
  }

  const handleDownloadStudentList = () => {
    if (!students.length) return
    downloadStudentsListCsv(students)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Alumnos</h1>
          <p className="text-sm text-muted">
            Consulta el plan de cada alumno y el uso de clases según el ciclo
            de vigencia del pago activo (desde la fecha del pago hasta un mes
            después).
          </p>
        </div>
        {isAdmin && (
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleDownloadStudentList}
              disabled={loading || students.length === 0}
              title="Genera un archivo CSV que se abre con Excel, Google Sheets o Numbers"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-400 hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Descargar lista
            </button>
            <p className="mt-1 text-center text-[10px] text-muted sm:text-left">
              Archivo CSV (compatible con Excel)
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <StudentTable
        students={students}
        loading={loading}
        isAdmin={!!isAdmin}
        onBlockStudent={handleBlockStudent}
        onDeleteStudent={handleDeleteStudent}
      />
    </div>
  )
}


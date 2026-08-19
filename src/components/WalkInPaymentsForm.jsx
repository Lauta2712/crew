import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { SelectField } from './SelectField'
import { toSpanishError } from '../utils/errors'
import {
  isDiscountEligiblePack,
  isWalkInSchedule,
  WALK_IN_DISCOUNT_ELIGIBLE_LABEL,
  WALK_IN_DISCOUNT_ELIGIBLE_SHORT,
  WALK_IN_STANDARD_SHORT,
} from '../constants/packs'

const VISITOR_DAY_PASS_ID = '__visitante_walkin_dia__'

/**
 * @param {{ mode: 'coach' | 'admin', title?: string, hideHeading?: boolean, className?: string }} props
 */
export function WalkInPaymentsForm({ mode, title, hideHeading = false, className = '' }) {
  const { profile } = useAuth()
  const { classPacks, walkIn } = useGymCatalog()
  const mainPackIds = useMemo(
    () => classPacks.filter((p) => !p.unlimited).map((p) => p.id),
    [classPacks],
  )
  const fallbackMainPackId = mainPackIds[0] ?? 'single'
  const unlimitedPackId = useMemo(
    () => classPacks.find((p) => p.unlimited)?.id ?? null,
    [classPacks],
  )
  const [assignments, setAssignments] = useState([])
  const [loadingAssignments, setLoadingAssignments] = useState(mode === 'coach')
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [registeringPayment, setRegisteringPayment] = useState(false)
  const [registeringMonthlyPayment, setRegisteringMonthlyPayment] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [paymentStudentId, setPaymentStudentId] = useState('')
  const [monthlyMuroStudentId, setMonthlyMuroStudentId] = useState('')
  const [activeTab, setActiveTab] = useState('cuota')
  const [freeWallPaymentProfiles, setFreeWallPaymentProfiles] = useState([])

  const paymentMethods = useMemo(
    () =>
      mode === 'admin'
        ? {
            visitante: 'registro_manual_admin_muro_visitante',
            diaAlumno: 'registro_manual_admin_muro_dia',
            mensual: 'registro_manual_admin_mensual_muro',
          }
        : {
            visitante: 'registro_manual_profesor_muro_visitante',
            diaAlumno: 'registro_manual_profesor',
            mensual: 'registro_manual_profesor_mensual_muro',
          },
    [mode],
  )

  const isFreeWallCoach = useMemo(
    () => assignments.some((a) => isWalkInSchedule(a.schedule_type_id, walkIn)),
    [assignments, walkIn],
  )

  const canUseForm = mode === 'admin' || isFreeWallCoach

  const selectedPaymentStudent = useMemo(() => {
    if (paymentStudentId === VISITOR_DAY_PASS_ID) {
      return {
        id: VISITOR_DAY_PASS_ID,
        name: 'Visitante (sin cuenta)',
        isVisitor: true,
        freeWallPrice: walkIn.priceDefault,
        muroDiscount: false,
      }
    }
    return freeWallPaymentProfiles.find((s) => s.id === paymentStudentId) ?? null
  }, [freeWallPaymentProfiles, paymentStudentId, walkIn.priceDefault])

  const dayPassSelectOptions = useMemo(
    () => [
      {
        value: VISITOR_DAY_PASS_ID,
        label: `Visitante (sin cuenta) — $${walkIn.priceDefault.toLocaleString('es-AR')}`,
      },
      ...freeWallPaymentProfiles.map((s) => ({
        value: s.id,
        label: `${s.name} — $${s.freeWallPrice.toLocaleString('es-AR')}${s.muroDiscount ? ' · tarifa reducida' : ''}`,
      })),
    ],
    [freeWallPaymentProfiles, walkIn.priceDefault],
  )

  const selectedMonthlyMuroStudent = useMemo(
    () => freeWallPaymentProfiles.find((s) => s.id === monthlyMuroStudentId) ?? null,
    [freeWallPaymentProfiles, monthlyMuroStudentId],
  )

  const loadAssignments = useCallback(async () => {
    if (mode !== 'coach' || !profile?.id) {
      setAssignments([])
      setLoadingAssignments(false)
      return
    }
    setLoadingAssignments(true)
    try {
      const { data, error: err } = await supabase
        .from('coach_assignments')
        .select('id, schedule_type_id')
        .eq('coach_id', profile.id)
      if (err) throw err
      setAssignments(data ?? [])
    } catch {
      setAssignments([])
    } finally {
      setLoadingAssignments(false)
    }
  }, [mode, profile?.id])

  const loadFreeWallPaymentProfiles = useCallback(async () => {
    if (!profile?.id) return
    setLoadingProfiles(true)
    setError(null)
    try {
      let usersQuery = supabase
        .from('users')
        .select('id, name, email, role, deleted_at, gym_id')
        .eq('role', 'student')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      if (profile?.gym_id) {
        usersQuery = usersQuery.or(`gym_id.eq.${profile.gym_id},gym_id.is.null`)
      }

      const [
        { data: allStudents, error: studentsError },
        { data: paymentRows, error: paymentsError },
        { data: subRows, error: subError },
      ] = await Promise.all([
        usersQuery,
        supabase
          .from('payments')
          .select('student_id, pack_type, paid_at')
          .order('paid_at', { ascending: false })
          .limit(2000),
        supabase
          .from('subscriptions')
          .select('student_id, classes_total'),
      ])

      if (studentsError) throw studentsError
      if (paymentsError) throw paymentsError
      // subError is non-fatal — fall back to payments-only detection

      const latestMainByStudent = new Map()
      for (const payment of paymentRows ?? []) {
        if (!payment?.student_id) continue
        if (!mainPackIds.includes(payment.pack_type)) continue
        if (!latestMainByStudent.has(payment.student_id)) {
          latestMainByStudent.set(payment.student_id, payment)
        }
      }

      // Each student has at most one subscription row (updated in place on each payment).
      // If classes_total >= 8 they're on pack8 or grupo_entrenamiento → discount applies.
      const discountBySubscription = new Set()
      if (!subError) {
        for (const sub of subRows ?? []) {
          if ((sub?.classes_total ?? 0) >= 8) {
            discountBySubscription.add(sub.student_id)
          }
        }
      }

      const mapped = (allStudents ?? []).map((student) => {
        const latestMain = latestMainByStudent.get(student.id) ?? null
        const muroDiscount =
          isDiscountEligiblePack(latestMain?.pack_type, walkIn) ||
          discountBySubscription.has(student.id)
        return {
          id: student.id,
          name: student.name ?? student.email ?? 'Alumno',
          email: student.email ?? '',
          latestMainPackType: latestMain?.pack_type ?? null,
          muroDiscount,
          freeWallPrice: muroDiscount ? walkIn.priceWithDiscount : walkIn.priceDefault,
          freeWallMonthlyPrice: muroDiscount ? walkIn.monthlyWithDiscount : walkIn.monthlyDefault,
        }
      })

      setFreeWallPaymentProfiles(mapped)
    } catch (err) {
      setError(toSpanishError(err, 'No se pudieron cargar los datos'))
      setFreeWallPaymentProfiles([])
    } finally {
      setLoadingProfiles(false)
    }
  }, [profile, walkIn, mainPackIds])

  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  useEffect(() => {
    if (!canUseForm) {
      setFreeWallPaymentProfiles([])
      setPaymentStudentId('')
      setMonthlyMuroStudentId('')
      return
    }
    loadFreeWallPaymentProfiles()
  }, [canUseForm, loadFreeWallPaymentProfiles])

  const clearMessages = () => {
    setError(null)
    setSuccessMessage(null)
  }

  const handleRegisterFreeWallPayment = async () => {
    if (!paymentStudentId) return
    const target = selectedPaymentStudent
    if (!target) return
    setRegisteringPayment(true)
    clearMessages()
    try {
      const paidDate = new Date()
      const monthStart = new Date(paidDate.getFullYear(), paidDate.getMonth(), 1)

      if (!target.isVisitor) {
        const { data: existingPayments, error: existingError } = await supabase
          .from('payments')
          .select('id')
          .eq('student_id', paymentStudentId)
          .eq('schedule_type', walkIn.scheduleId)
          .gte('paid_at', monthStart.toISOString())
          .limit(1)

        if (existingError) throw existingError
        if (existingPayments?.length > 0) {
          throw new Error('Este alumno ya tiene un pago de acceso libre registrado este mes.')
        }
      }

      const { error: insertError } = await supabase.from('payments').insert([
        target.isVisitor
          ? {
              student_id: null,
              pack_type: fallbackMainPackId,
              schedule_type: walkIn.scheduleId,
              paid_at: paidDate.toISOString(),
              amount: walkIn.priceDefault,
              payment_method: paymentMethods.visitante,
            }
          : {
              student_id: paymentStudentId,
              pack_type: target.latestMainPackType ?? fallbackMainPackId,
              schedule_type: walkIn.scheduleId,
              paid_at: paidDate.toISOString(),
              amount: target.freeWallPrice,
              payment_method: paymentMethods.diaAlumno,
            },
      ])

      if (insertError) throw insertError

      setSuccessMessage(
        `Pase diario registrado: ${target.name} · $${target.freeWallPrice.toLocaleString('es-AR')}`,
      )
      setPaymentStudentId('')
      await loadFreeWallPaymentProfiles()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo registrar el pago'))
    } finally {
      setRegisteringPayment(false)
    }
  }

  const handleRegisterFreeWallMonthlyPayment = async () => {
    if (!monthlyMuroStudentId) return
    const target = freeWallPaymentProfiles.find((s) => s.id === monthlyMuroStudentId)
    if (!target) return
    const amount = target.freeWallMonthlyPrice

    setRegisteringMonthlyPayment(true)
    clearMessages()
    try {
      const paidDate = new Date()
      const monthStart = new Date(paidDate.getFullYear(), paidDate.getMonth(), 1)

      const { data: existingPayments, error: existingError } = await supabase
        .from('payments')
        .select('id')
        .eq('student_id', monthlyMuroStudentId)
        .eq('schedule_type', walkIn.scheduleId)
        .gte('paid_at', monthStart.toISOString())
        .limit(1)

      if (existingError) throw existingError
      if (existingPayments?.length > 0) {
        throw new Error(
          'Este alumno ya tiene un pago de acceso libre en este mes (pase diario o pase mensual).',
        )
      }

      const { error: insertError } = await supabase.from('payments').insert([
        {
          student_id: monthlyMuroStudentId,
          pack_type: unlimitedPackId,
          schedule_type: walkIn.scheduleId,
          paid_at: paidDate.toISOString(),
          amount,
          payment_method: paymentMethods.mensual,
        },
      ])

      if (insertError) throw insertError

      setSuccessMessage(
        `Pase mensual registrado: ${target.name} · $${amount.toLocaleString('es-AR')}`,
      )
      setMonthlyMuroStudentId('')
      await loadFreeWallPaymentProfiles()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo registrar el pase mensual'))
    } finally {
      setRegisteringMonthlyPayment(false)
    }
  }

  const loading = loadingAssignments || loadingProfiles
  const heading = title ?? (mode === 'admin' ? 'Acceso libre' : 'Registrar pagos — acceso libre')

  const pricesCard = (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Precios de referencia
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-bg px-3 py-2">
          <dt className="text-xs font-medium text-muted">Pase diario (acceso libre)</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            ${walkIn.priceWithDiscount.toLocaleString('es-AR')} · {WALK_IN_DISCOUNT_ELIGIBLE_SHORT}
          </dd>
          <dd className="text-muted">
            ${walkIn.priceDefault.toLocaleString('es-AR')} · {WALK_IN_STANDARD_SHORT}
          </dd>
        </div>
        <div className="rounded-lg bg-bg px-3 py-2">
          <dt className="text-xs font-medium text-muted">Pase mensual</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            ${walkIn.monthlyWithDiscount.toLocaleString('es-AR')} · {WALK_IN_DISCOUNT_ELIGIBLE_SHORT}
          </dd>
          <dd className="text-muted">
            ${walkIn.monthlyDefault.toLocaleString('es-AR')} · {WALK_IN_STANDARD_SHORT}
          </dd>
        </div>
      </dl>
    </div>
  )

  const tabSwitcher = (
    <div className="flex rounded-xl border border-line bg-surface/80 p-1">
      <button
        type="button"
        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          activeTab === 'cuota'
            ? 'bg-surface text-ink shadow-sm'
            : 'text-muted hover:text-ink'
        }`}
        onClick={() => { setActiveTab('cuota'); clearMessages() }}
      >
        Pase diario
      </button>
      <button
        type="button"
        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          activeTab === 'mensual'
            ? 'bg-surface text-ink shadow-sm'
            : 'text-muted hover:text-ink'
        }`}
        onClick={() => { setActiveTab('mensual'); clearMessages() }}
      >
        Pase mensual
      </button>
    </div>
  )

  const formCard = (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      {loadingProfiles ? (
        <p className="text-sm text-muted">Cargando alumnos…</p>
      ) : activeTab === 'cuota' ? (
        <div className="space-y-4">
          {mode !== 'admin' && (
            <p className="text-sm text-muted">
              Visitantes: un registro por cada pago del día. Alumnos: un pago de acceso libre por mes
              por persona.
            </p>
          )}
          <SelectField
            label="Alumno o visitante"
            placeholder="Elegí quién abona"
            value={paymentStudentId}
            onChange={(value) => { setPaymentStudentId(value); clearMessages() }}
            options={dayPassSelectOptions}
            disabled={registeringPayment}
            variant="light"
          />
          {selectedPaymentStudent && (
            <p className="rounded-lg bg-brand-900/25 px-3 py-2 text-sm text-brand-400">
              <span className="font-semibold">Total a cobrar:</span>{' '}
              ${selectedPaymentStudent.freeWallPrice.toLocaleString('es-AR')}
              {selectedPaymentStudent.isVisitor
                ? ' (visitante — tarifa estándar)'
                : selectedPaymentStudent.muroDiscount
                  ? ` (${WALK_IN_DISCOUNT_ELIGIBLE_SHORT} — tarifa reducida)`
                  : ''}
            </p>
          )}
          <button
            type="button"
            className="btn-primary w-full py-2.5 text-sm"
            disabled={!paymentStudentId || registeringPayment}
            onClick={handleRegisterFreeWallPayment}
          >
            {registeringPayment ? 'Guardando…' : 'Registrar pase diario'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {mode !== 'admin' && (
            <p className="text-sm text-muted">
              Acceso ilimitado durante el mes. Un solo registro por alumno y por mes.
            </p>
          )}
          <SelectField
            label="Alumno"
            placeholder={freeWallPaymentProfiles.length === 0 ? 'No hay alumnos' : 'Elegí quién abona'}
            value={monthlyMuroStudentId}
            onChange={(value) => { setMonthlyMuroStudentId(value); clearMessages() }}
            options={freeWallPaymentProfiles.map((s) => ({
              value: s.id,
              label: `${s.name} — $${s.freeWallMonthlyPrice.toLocaleString('es-AR')}${s.muroDiscount ? ' · tarifa reducida' : ''}`,
            }))}
            disabled={freeWallPaymentProfiles.length === 0 || registeringMonthlyPayment}
            variant="light"
          />
          {selectedMonthlyMuroStudent && (
            <p className="rounded-lg bg-brand-900/25 px-3 py-2 text-sm text-brand-400">
              <span className="font-semibold">Total a cobrar:</span>{' '}
              ${selectedMonthlyMuroStudent.freeWallMonthlyPrice.toLocaleString('es-AR')}
              {selectedMonthlyMuroStudent.muroDiscount
                ? ` (${WALK_IN_DISCOUNT_ELIGIBLE_SHORT} — tarifa reducida)`
                : ''}
            </p>
          )}
          <button
            type="button"
            className="btn-primary w-full py-2.5 text-sm"
            disabled={!monthlyMuroStudentId || registeringMonthlyPayment}
            onClick={handleRegisterFreeWallMonthlyPayment}
          >
            {registeringMonthlyPayment ? 'Guardando…' : 'Registrar pase mensual'}
          </button>
        </div>
      )}
    </div>
  )

  const refreshButton = (
    <button
      type="button"
      className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
      disabled={loading}
      onClick={() => loadFreeWallPaymentProfiles()}
    >
      Actualizar lista de alumnos
    </button>
  )

  return (
    <div className={`flex w-full ${mode === 'admin' ? '' : 'max-w-lg'} flex-col gap-4 ${className}`}>
      {!hideHeading && (
        <div>
          <h2 className="text-lg font-semibold text-ink">{heading}</h2>
          <p className="mt-1 text-sm text-muted">
            Pase diario o mensual de acceso libre. Visitantes sin cuenta: tarifa estándar. Alumnos con{' '}
            {WALK_IN_DISCOUNT_ELIGIBLE_LABEL}: tarifa reducida.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {successMessage && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-400">
          {successMessage}
        </p>
      )}

      {mode === 'coach' && loadingAssignments ? (
        <p className="text-sm text-muted">Comprobando tu asignación…</p>
      ) : !canUseForm ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
          No tenés el horario <span className="font-semibold">Acceso libre</span> asignado. Pedile a un
          administrador que te lo cargue en Profesores; esta pantalla solo aplica a ese rol.
        </div>
      ) : mode === 'admin' ? (
        /* Admin embed: precios ya están en el card padre, solo tabs + form */
        <div className="flex flex-col gap-4">
          {tabSwitcher}
          {formCard}
          {refreshButton}
        </div>
      ) : (
        /* Coach / standalone: layout completo con precios */
        <div className="flex flex-col gap-5">
          {pricesCard}
          {tabSwitcher}
          {formCard}
          {refreshButton}
        </div>
      )}
    </div>
  )
}

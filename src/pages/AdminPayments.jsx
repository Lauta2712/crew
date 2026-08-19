import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { formatPackOptionLabel, isWalkInSchedule, PACK8_MENSUAL_NAME } from '../constants/packs'
import { SelectField } from '../components/SelectField'
import { WalkInPaymentsForm } from '../components/WalkInPaymentsForm'
import { toSpanishError } from '../utils/errors'
import {
  assertPaymentAllowedThisMonth,
  filterExpiredPackPayments,
  resolveManualPaymentRow,
  shouldSyncSubscriptionAfterManualPayment,
} from '../utils/manualPaymentInsert'

const GRUPO_PACK_ID = 'grupo_entrenamiento'
const GRUPO_SCHEDULE_ID = 'grupo_entrenamiento'

export function AdminPaymentsPage() {
  const { profile } = useAuth()
  const { classPacks, scheduleTypes, walkIn } = useGymCatalog()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [mainTab, setMainTab] = useState('general')

  const [studentId, setStudentId] = useState('')
  const [packId, setPackId] = useState('')
  const [scheduleId, setScheduleId] = useState('')
  const [scheduleSlot, setScheduleSlot] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const [grupoStudentId, setGrupoStudentId] = useState('')
  const [grupoScheduleSlot, setGrupoScheduleSlot] = useState('')
  const [savingGrupo, setSavingGrupo] = useState(false)

  const catalog = { classPacks, walkIn }
  const generalPacks = classPacks.filter((pack) => pack.id !== GRUPO_PACK_ID && !pack.unlimited)
  const generalSchedules = scheduleTypes.filter(
    (schedule) => schedule.id !== GRUPO_SCHEDULE_ID && !isWalkInSchedule(schedule.id, walkIn),
  )

  // The schedule object currently selected in the Escuelas form
  const selectedScheduleType = generalSchedules.find((s) => s.id === scheduleId) ?? null
  // Slots for the selected schedule — used to show a slot picker when >1 slot exists
  const selectedScheduleSlots = selectedScheduleType?.slots ?? []
  const requiresSlotPick = selectedScheduleSlots.length > 1

  // Same for Grupo (grupo_entrenamiento always has a single slot, but derive it uniformly)
  const grupoScheduleType = scheduleTypes.find((s) => s.id === GRUPO_SCHEDULE_ID) ?? null
  const grupoSlots = grupoScheduleType?.slots ?? []
  const grupoRequiresSlotPick = grupoSlots.length > 1

  useEffect(() => {
    let active = true

    async function loadStudents() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('users')
          .select('id, name, email, role')
          .eq('role', 'student')
          .is('deleted_at', null)
          .order('name', { ascending: true })

        if (profile?.gym_id) {
          query = query.or(`gym_id.eq.${profile.gym_id},gym_id.is.null`)
        }

        const { data, error: qErr } = await query
        if (qErr) throw qErr
        if (!active) return
        setStudents((data ?? []).filter((student) => student.role === 'student'))
      } catch (err) {
        if (!active) return
        setError(toSpanishError(err, 'No se pudieron cargar los alumnos'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadStudents()

    return () => {
      active = false
    }
  }, [profile])

  const syncSubscriptionIfNeeded = async (studentIdParam, scheduleIdParam, pack, paidDate) => {
    if (
      !shouldSyncSubscriptionAfterManualPayment({ scheduleId: scheduleIdParam, walkIn }) ||
      !pack?.classes_per_month ||
      !profile?.gym_id
    ) {
      return
    }
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id')
      .eq('gym_id', profile.gym_id)
      .eq('classes_per_month', pack.classes_per_month)
      .maybeSingle()

    if (planError || !plan) return

    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('student_id', studentIdParam)
      .limit(1)

    if (existingSubs && existingSubs.length > 0) {
      await supabase
        .from('subscriptions')
        .update({
          plan_id: plan.id,
          classes_total: pack.classes_per_month,
          start_date: paidDate.toISOString().slice(0, 10),
        })
        .eq('id', existingSubs[0].id)
    } else {
      await supabase.from('subscriptions').insert([
        {
          student_id: studentIdParam,
          plan_id: plan.id,
          classes_total: pack.classes_per_month,
          start_date: paidDate.toISOString().slice(0, 10),
        },
      ])
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!studentId || !packId || !scheduleId) return
    if (requiresSlotPick && !scheduleSlot) return

    const pack = classPacks.find((p) => p.id === packId)

    setSaving(true)
    setError(null)
    setSuccessMessage('')

    try {
      const paidDate = new Date()
      const monthStart = new Date(paidDate.getFullYear(), paidDate.getMonth(), 1)
      const monthEnd = new Date(paidDate.getFullYear(), paidDate.getMonth() + 1, 0, 23, 59, 59, 999)

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
        paidDate,
      )
      assertPaymentAllowedThisMonth(activePayments, { scheduleId, walkIn })

      const row = await resolveManualPaymentRow(supabase, {
        studentId,
        packId,
        scheduleId,
        scheduleSlot: scheduleSlot || null,
        paidAt: paidDate,
        catalog,
      })

      const { error: insertError } = await supabase.from('payments').insert([row])

      if (insertError) throw insertError

      if (
        shouldSyncSubscriptionAfterManualPayment({ scheduleId, walkIn }) &&
        pack?.classes_per_month &&
        profile?.gym_id
      ) {
        await syncSubscriptionIfNeeded(studentId, scheduleId, pack, paidDate)
      }

      setSuccessMessage('Pago registrado correctamente.')
      setPackId('')
      setScheduleId('')
      setScheduleSlot('')
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo registrar el pago'))
    } finally {
      setSaving(false)
    }
  }

  const handleGrupoSubmit = async (event) => {
    event.preventDefault()
    if (!grupoStudentId) return

    const pack = classPacks.find((p) => p.id === GRUPO_PACK_ID)
    if (!pack) return

    setSavingGrupo(true)
    setError(null)
    setSuccessMessage('')

    try {
      const paidDate = new Date()
      const monthStart = new Date(paidDate.getFullYear(), paidDate.getMonth(), 1)
      const monthEnd = new Date(paidDate.getFullYear(), paidDate.getMonth() + 1, 0, 23, 59, 59, 999)

      const { data: existingPayments, error: existingError } = await supabase
        .from('payments')
        .select('id, schedule_type, pack_type, paid_at')
        .eq('student_id', grupoStudentId)
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString())

      if (existingError) throw existingError

      const { data: recentAttendances } = await supabase
        .from('attendances')
        .select('attended_at')
        .eq('student_id', grupoStudentId)
        .gte('attended_at', monthStart.toISOString())

      const activePayments = filterExpiredPackPayments(
        existingPayments,
        recentAttendances,
        classPacks,
        paidDate,
      )
      assertPaymentAllowedThisMonth(activePayments, { scheduleId: GRUPO_SCHEDULE_ID, walkIn })

      const row = await resolveManualPaymentRow(supabase, {
        studentId: grupoStudentId,
        packId: GRUPO_PACK_ID,
        scheduleId: GRUPO_SCHEDULE_ID,
        scheduleSlot: grupoScheduleSlot || null,
        paidAt: paidDate,
        catalog,
      })

      const { error: insertError } = await supabase.from('payments').insert([row])

      if (insertError) throw insertError

      if (pack.classes_per_month && profile?.gym_id) {
        await syncSubscriptionIfNeeded(grupoStudentId, GRUPO_SCHEDULE_ID, pack, paidDate)
      }

      setSuccessMessage('Pago de grupo de entrenamiento registrado.')
      setGrupoStudentId('')
      setGrupoScheduleSlot('')
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo registrar el pago de grupo'))
    } finally {
      setSavingGrupo(false)
    }
  }

  const grupoPack = classPacks.find((p) => p.id === GRUPO_PACK_ID)
  const grupoSlot = scheduleTypes.find((s) => s.id === GRUPO_SCHEDULE_ID)?.slots?.[0]
  const grupoFranjaEjemplo = grupoSlot
    ? `${grupoSlot.days} · ${grupoSlot.time}`
    : 'configurá las franjas en Configuración'

  return (
    <div className="py-2 sm:py-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {error && (
          <p className="shrink-0 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {successMessage && (
          <p className="shrink-0 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-400">
            {successMessage}
          </p>
        )}

        <div className="shrink-0 rounded-2xl border border-line bg-surface p-1.5 shadow-sm">
          <div
            className="grid grid-cols-3 gap-1.5"
            role="tablist"
            aria-label="Tipo de pago"
          >
            {[
              { id: 'general', label: 'Escuelas' },
              { id: 'muro', label: 'Acceso libre' },
              { id: 'grupo', label: 'Grupo' },
            ].map((t) => {
              const selected = mainTab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`rounded-xl px-2 py-1.5 text-center text-[11px] font-semibold leading-tight transition sm:px-4 sm:text-xs ${
                    selected
                      ? 'bg-[var(--color-brand-900)] text-white shadow-md ring-2 ring-[var(--color-brand-600)] ring-offset-1 ring-offset-surface'
                      : 'border border-line bg-bg text-ink hover:border-line hover:bg-surface'
                  }`}
                  onClick={() => {
                    setMainTab(t.id)
                    setSuccessMessage('')
                    setError(null)
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {mainTab === 'muro' && (
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-md sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <h2 className="text-lg font-bold text-ink">Acceso libre</h2>
              <div className="flex flex-col gap-0.5 text-xs text-muted sm:flex-row sm:gap-4">
                <span>
                  Diario:{' '}
                  <span className="font-medium text-ink">
                    ${walkIn.priceWithDiscount.toLocaleString('es-AR')}
                  </span>{' '}
                  reducida ·{' '}
                  <span className="font-medium text-ink">
                    ${walkIn.priceDefault.toLocaleString('es-AR')}
                  </span>{' '}
                  estándar
                </span>
                <span>
                  Mensual:{' '}
                  <span className="font-medium text-ink">
                    ${walkIn.monthlyWithDiscount.toLocaleString('es-AR')}
                  </span>{' '}
                  reducida ·{' '}
                  <span className="font-medium text-ink">
                    ${walkIn.monthlyDefault.toLocaleString('es-AR')}
                  </span>{' '}
                  estándar
                </span>
              </div>
            </div>
            <WalkInPaymentsForm mode="admin" hideHeading className="mt-4 max-w-none" />
          </div>
        )}

        {mainTab === 'grupo' && (
          <div className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-md sm:p-6">
            <h2 className="text-lg font-bold text-ink">Grupo de entrenamiento</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Mismo cupo mensual que <span className="font-semibold text-ink">{PACK8_MENSUAL_NAME}</span>.
              Pack:{' '}
              <span className="font-semibold text-ink">{grupoPack?.name ?? 'Grupo'}</span>. Una
              cuota por alumno y mes para este horario. Franja principal:{' '}
              <span className="font-medium text-ink">{grupoFranjaEjemplo}</span>.
            </p>
            <form className="mt-4 flex max-w-xl flex-col gap-4 sm:mt-6 sm:gap-5" onSubmit={handleGrupoSubmit}>
              <SelectField
                label="Alumno"
                placeholder={loading ? 'Cargando…' : 'Seleccionar alumno'}
                value={grupoStudentId}
                onChange={setGrupoStudentId}
                disabled={loading}
                variant="light"
                options={students.map((s) => ({
                  value: s.id,
                  label: s.name || s.email,
                }))}
              />
              <SelectField
                label="Turno / franja horaria"
                placeholder={grupoSlots.length === 0 ? 'Sin turnos configurados' : 'Seleccionar turno'}
                value={
                  grupoRequiresSlotPick
                    ? grupoScheduleSlot
                    : grupoSlots[0]
                      ? `${grupoSlots[0].days}|${grupoSlots[0].time}`
                      : ''
                }
                onChange={setGrupoScheduleSlot}
                variant="light"
                disabled={!grupoRequiresSlotPick}
                options={grupoSlots.map((slot) => ({
                  value: `${slot.days}|${slot.time}`,
                  label: `${slot.days} · ${slot.time}`,
                }))}
              />
              <div className="rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink">
                Monto:{' '}
                <span className="font-semibold text-ink">
                  ${(grupoPack?.price ?? 0).toLocaleString('es-AR')}
                </span>
                <span className="text-muted"> · </span>
                <span className="text-muted">Ajustable en Configuración</span>
              </div>
              <button
                type="submit"
                className="btn-primary w-full py-2.5 text-sm font-semibold sm:w-auto sm:min-w-[240px]"
                disabled={savingGrupo || loading || !grupoStudentId || (grupoRequiresSlotPick && !grupoScheduleSlot)}
              >
                {savingGrupo ? 'Guardando…' : 'Registrar pago de grupo'}
              </button>
            </form>
          </div>
        )}

        {mainTab === 'general' && (
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-md sm:p-6">
            <h2 className="text-lg font-bold text-ink">Escuelas</h2>
            <form className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <SelectField
                    label="Alumno"
                    placeholder="Seleccionar alumno"
                    value={studentId}
                    onChange={setStudentId}
                    disabled={loading}
                    variant="light"
                    options={students.map((s) => ({
                      value: s.id,
                      label: s.name || s.email,
                    }))}
                  />
                </div>
                <SelectField
                  label="Pack de clases"
                  placeholder="Seleccionar pack"
                  value={packId}
                  onChange={setPackId}
                  variant="light"
                  options={generalPacks.map((pack) => ({
                    value: pack.id,
                    label: formatPackOptionLabel(pack, walkIn),
                  }))}
                />
                <SelectField
                  label="Horario / tipo de clase"
                  placeholder="Seleccionar horario"
                  value={scheduleId}
                  onChange={(value) => {
                    setScheduleId(value)
                    const sched = generalSchedules.find((s) => s.id === value)
                    const slots = sched?.slots ?? []
                    setScheduleSlot(slots.length === 1 ? `${slots[0].days}|${slots[0].time}` : '')
                  }}
                  variant="light"
                  options={generalSchedules.map((schedule) => ({
                    value: schedule.id,
                    label: schedule.name,
                  }))}
                />
                <SelectField
                  label="Turno / franja horaria"
                  placeholder={!scheduleId ? 'Primero elegí un horario' : 'Seleccionar turno'}
                  value={scheduleSlot}
                  onChange={setScheduleSlot}
                  variant="light"
                  disabled={!scheduleId || !requiresSlotPick}
                  options={selectedScheduleSlots.map((slot) => ({
                    value: `${slot.days}|${slot.time}`,
                    label: `${slot.days} · ${slot.time}`,
                  }))}
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full py-2.5 text-sm font-semibold sm:w-auto sm:min-w-[200px]"
                disabled={saving || loading || (requiresSlotPick && !scheduleSlot)}
              >
                {saving ? 'Guardando…' : 'Registrar pago'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

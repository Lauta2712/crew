import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { getFunctionsInvokeFailureMessage, toSpanishError } from '../utils/errors'
import { invokeEdgeFunctionWithUserJwt } from '../utils/edgeFunctions'
import { saveSupportReturnSession } from '../utils/supportMode'
import { AmountValue } from '../components/AmountValue'
import { WaitModal } from '../components/WaitModal'
import { getSubscriptionPlan } from '../constants/subscriptionPlans'

const LOGIN_AS_GYM_ADMIN_EDGE_FUNCTION =
  import.meta.env.VITE_SUPABASE_LOGIN_AS_GYM_ADMIN_FUNCTION?.trim() ||
  'login-as-gym-admin'

const LIST_CREW_SUBSCRIPTIONS_EDGE_FUNCTION =
  import.meta.env.VITE_SUPABASE_LIST_CREW_SUBSCRIPTIONS_FUNCTION?.trim() ||
  'list-crew-subscriptions'

const SUBSCRIPTION_STATUS_LABEL = {
  pending: 'Pendiente',
  authorized: 'Al día',
  paused: 'Pausada',
  cancelled: 'Cancelada',
}

const SUBSCRIPTION_STATUS_CLASS = {
  pending: 'border-amber-500/40 bg-amber-950/40 text-amber-400',
  authorized: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400',
  paused: 'border-amber-500/40 bg-amber-950/40 text-amber-400',
  cancelled: 'border-red-500/40 bg-red-950/40 text-red-400',
}

function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('es-AR')}`
}

function formatShortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SuperAdminDashboardPage() {
  const navigate = useNavigate()
  const [gymRows, setGymRows] = useState([])
  const [totals, setTotals] = useState({ gyms: 0, students: 0, revenueMonth: 0, revenueTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [togglingGymId, setTogglingGymId] = useState(null)
  const [confirmPauseId, setConfirmPauseId] = useState(null)
  const [loggingInGymId, setLoggingInGymId] = useState(null)
  const [loggingInGymName, setLoggingInGymName] = useState('')

  const [subscriptions, setSubscriptions] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [subsError, setSubsError] = useState(null)

  const loadSubscriptions = useCallback(async () => {
    setLoadingSubs(true)
    setSubsError(null)
    try {
      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        LIST_CREW_SUBSCRIPTIONS_EDGE_FUNCTION,
        { body: {} },
      )
      if (fnError) {
        const details = await getFunctionsInvokeFailureMessage(
          fnError,
          LIST_CREW_SUBSCRIPTIONS_EDGE_FUNCTION,
        )
        throw new Error(details || 'No se pudieron cargar las suscripciones')
      }
      if (data?.error) throw new Error(String(data.error))
      setSubscriptions(data?.subscriptions ?? [])
    } catch (err) {
      setSubsError(toSpanishError(err, 'No se pudieron cargar las suscripciones a Crew'))
    } finally {
      setLoadingSubs(false)
    }
  }, [])

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: gyms, error: gymsError }, { data: students, error: studentsError }, { data: payments, error: paymentsError }] =
        await Promise.all([
          supabase.from('gyms').select('id, name, created_at, paused_at').order('name', { ascending: true }),
          supabase.from('users').select('id, gym_id').eq('role', 'student').is('deleted_at', null),
          supabase.from('payments').select('id, amount, paid_at, student_id'),
        ])

      if (gymsError) throw gymsError
      if (studentsError) throw studentsError
      if (paymentsError) throw paymentsError

      // payments no tiene gym_id propio — se atribuye por el gym_id del alumno.
      const gymByStudentId = new Map((students ?? []).map((s) => [s.id, s.gym_id]))

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const statsByGym = new Map()
      const ensure = (gymId) => {
        if (!statsByGym.has(gymId)) {
          statsByGym.set(gymId, { students: 0, revenueMonth: 0, revenueTotal: 0 })
        }
        return statsByGym.get(gymId)
      }

      ;(students ?? []).forEach((s) => {
        ensure(s.gym_id).students += 1
      })

      let revenueMonthTotal = 0
      let revenueGrandTotal = 0
      ;(payments ?? []).forEach((p) => {
        const gymId = gymByStudentId.get(p.student_id) ?? null
        const amount = Number(p.amount) || 0
        const entry = ensure(gymId)
        entry.revenueTotal += amount
        revenueGrandTotal += amount
        if (new Date(p.paid_at) >= startOfMonth) {
          entry.revenueMonth += amount
          revenueMonthTotal += amount
        }
      })

      const rows = (gyms ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        createdAt: g.created_at,
        pausedAt: g.paused_at,
        ...(statsByGym.get(g.id) ?? { students: 0, revenueMonth: 0, revenueTotal: 0 }),
      }))
      rows.sort((a, b) => b.revenueMonth - a.revenueMonth)

      setGymRows(rows)
      setTotals({
        gyms: (gyms ?? []).length,
        students: (students ?? []).length,
        revenueMonth: revenueMonthTotal,
        revenueTotal: revenueGrandTotal,
      })
    } catch (err) {
      setError(toSpanishError(err, 'No se pudieron cargar las métricas globales'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleTogglePause = async (gymId, pause) => {
    setTogglingGymId(gymId)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('gyms')
        .update({ paused_at: pause ? new Date().toISOString() : null })
        .eq('id', gymId)
      if (updateError) throw updateError
      setConfirmPauseId(null)
      await loadData()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo actualizar el estado del gimnasio'))
    } finally {
      setTogglingGymId(null)
    }
  }

  const handleLoginAsAdmin = async (gymId, gymName) => {
    setLoggingInGymId(gymId)
    setLoggingInGymName(gymName)
    setError(null)
    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!currentSession) throw new Error('No hay sesión activa.')

      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        LOGIN_AS_GYM_ADMIN_EDGE_FUNCTION,
        { body: { gym_id: gymId } },
      )

      if (fnError) {
        const details = await getFunctionsInvokeFailureMessage(
          fnError,
          LOGIN_AS_GYM_ADMIN_EDGE_FUNCTION,
        )
        throw new Error(details || 'No se pudo iniciar sesión como admin')
      }
      if (data?.error) throw new Error(String(data.error))
      if (!data?.success) {
        throw new Error(
          `La función «${LOGIN_AS_GYM_ADMIN_EDGE_FUNCTION}» no confirmó el acceso.`,
        )
      }

      // Guardamos la sesión de superadmin ANTES de canjear el token — así "Volver a
      // superadmin" puede restaurarla sin pedir contraseña de nuevo.
      saveSupportReturnSession(currentSession, gymName)

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.hashed_token,
        type: 'magiclink',
      })
      if (verifyError) throw verifyError

      navigate('/app', { replace: true })
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo iniciar sesión como admin del gimnasio'))
      setLoggingInGymId(null)
      setLoggingInGymName('')
    }
  }

  const handleCreateGymFromSubscription = (sub) => {
    navigate('/app/superadmin/gyms/new', {
      state: {
        gymName: sub.gym_name ?? '',
        adminName: sub.contact_name ?? '',
        adminEmail: sub.contact_email ?? '',
      },
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <WaitModal
        open={Boolean(loggingInGymId)}
        title={`Entrando como admin de «${loggingInGymName}»…`}
        message="Si el gimnasio no tiene una cuenta admin activa, se crea una de soporte automáticamente antes de continuar."
      />
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
            Panel superadmin
          </h1>
          <p className="text-sm text-muted">
            Vista global de todos los gimnasios. Métricas de solo lectura — podés pausar o
            reactivar un gimnasio desde acá.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="btn-secondary px-3 py-1.5 text-sm"
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <p className="shrink-0 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="grid shrink-0 gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gimnasios" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">{totals.gyms}</p>
        </StatCard>
        <StatCard label="Alumnos totales" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">{totals.students}</p>
        </StatCard>
        <StatCard label="Ingresos este mes" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-brand-500 sm:text-3xl">
            <AmountValue>{formatCurrency(totals.revenueMonth)}</AmountValue>
          </p>
        </StatCard>
        <StatCard label="Ingresos históricos" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">
            <AmountValue>{formatCurrency(totals.revenueTotal)}</AmountValue>
          </p>
        </StatCard>
      </div>

      <div className="card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          Por gimnasio — ordenado por ingresos del mes
        </p>
        {loading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : gymRows.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay gimnasios cargados.</p>
        ) : (
          <div className="space-y-2 overflow-x-auto">
            {gymRows.map((row) => (
              <div
                key={row.id}
                className="card-muted flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <p className="min-w-0 truncate font-semibold text-ink">{row.name}</p>
                  {row.pausedAt && (
                    <span className="shrink-0 rounded border border-amber-500/40 bg-amber-950/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                      Pausado
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-4 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Alumnos</p>
                    <p className="font-mono text-sm text-ink">{row.students}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Este mes</p>
                    <p className="font-mono text-sm text-brand-500">
                      <AmountValue>{formatCurrency(row.revenueMonth)}</AmountValue>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Histórico</p>
                    <p className="font-mono text-sm text-ink">
                      <AmountValue>{formatCurrency(row.revenueTotal)}</AmountValue>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-[11px]"
                    onClick={() => handleLoginAsAdmin(row.id, row.name)}
                    disabled={loggingInGymId === row.id || Boolean(row.pausedAt)}
                    title={
                      row.pausedAt
                        ? 'Reactivá el gimnasio para poder entrar como soporte.'
                        : 'Entrar como el admin de este gimnasio (modo soporte)'
                    }
                  >
                    {loggingInGymId === row.id ? 'Ingresando…' : 'Ingresar'}
                  </button>
                  {confirmPauseId === row.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-amber-400">¿Pausar «{row.name}»?</span>
                      <button
                        type="button"
                        className="rounded-lg border border-red-500/40 bg-surface px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                        onClick={() => handleTogglePause(row.id, true)}
                        disabled={togglingGymId === row.id}
                      >
                        {togglingGymId === row.id ? 'Pausando…' : 'Sí, pausar'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-[11px]"
                        onClick={() => setConfirmPauseId(null)}
                        disabled={togglingGymId === row.id}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : row.pausedAt ? (
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-[11px]"
                      onClick={() => handleTogglePause(row.id, false)}
                      disabled={togglingGymId === row.id}
                    >
                      {togglingGymId === row.id ? 'Reactivando…' : 'Reactivar'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg border border-red-500/40 bg-surface px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                      onClick={() => setConfirmPauseId(row.id)}
                      disabled={togglingGymId === row.id}
                    >
                      Pausar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Suscripciones a Crew — quién pagó y todavía no tiene gimnasio creado
          </p>
          <button
            type="button"
            onClick={loadSubscriptions}
            disabled={loadingSubs}
            className="btn-secondary px-3 py-1 text-xs"
          >
            {loadingSubs ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {subsError && (
          <p className="mb-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {subsError}
          </p>
        )}

        {loadingSubs ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : subscriptions.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay suscripciones registradas.</p>
        ) : (
          <div className="space-y-2 overflow-x-auto">
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="card-muted flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate font-semibold text-ink">
                      {sub.gym_name || sub.contact_name}
                    </p>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${
                        SUBSCRIPTION_STATUS_CLASS[sub.status] ?? SUBSCRIPTION_STATUS_CLASS.pending
                      }`}
                    >
                      {SUBSCRIPTION_STATUS_LABEL[sub.status] ?? sub.status}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {sub.contact_name} · {sub.contact_email}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-4 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Plan</p>
                    <p className="text-sm text-ink">
                      {getSubscriptionPlan(sub.plan_id)?.name ?? sub.plan_id}
                      <span className="text-muted"> · </span>
                      {sub.billing_period === 'annual' ? 'anual' : 'mensual'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Desde</p>
                    <p className="font-mono text-xs text-ink">{formatShortDate(sub.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-[11px]"
                    onClick={() => handleCreateGymFromSubscription(sub)}
                  >
                    Crear gimnasio
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, loading, children }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {loading ? <div className="mt-4 h-8 w-16 animate-pulse rounded bg-surface-2" /> : <div className="mt-2">{children}</div>}
    </div>
  )
}

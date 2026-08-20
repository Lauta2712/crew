import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { toSpanishError } from '../utils/errors'

function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('es-AR')}`
}

export function SuperAdminDashboardPage() {
  const [gymRows, setGymRows] = useState([])
  const [totals, setTotals] = useState({ gyms: 0, students: 0, revenueMonth: 0, revenueTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: gyms, error: gymsError }, { data: students, error: studentsError }, { data: payments, error: paymentsError }] =
        await Promise.all([
          supabase.from('gyms').select('id, name, created_at').order('name', { ascending: true }),
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

  return (
    <div className="flex flex-col gap-5">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
            Panel superadmin
          </h1>
          <p className="text-sm text-muted">
            Vista global de todos los gimnasios — solo lectura.
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
            {formatCurrency(totals.revenueMonth)}
          </p>
        </StatCard>
        <StatCard label="Ingresos históricos" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">
            {formatCurrency(totals.revenueTotal)}
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
                <p className="min-w-0 flex-1 truncate font-semibold text-ink">{row.name}</p>
                <div className="flex shrink-0 flex-wrap items-center gap-4 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Alumnos</p>
                    <p className="font-mono text-sm text-ink">{row.students}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Este mes</p>
                    <p className="font-mono text-sm text-brand-500">{formatCurrency(row.revenueMonth)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Histórico</p>
                    <p className="font-mono text-sm text-ink">{formatCurrency(row.revenueTotal)}</p>
                  </div>
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

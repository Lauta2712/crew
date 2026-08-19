import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isWalkInSchedule } from '../constants/packs'
import { toSpanishError } from '../utils/errors'
import { formatDateTime } from '../utils/dateFormatting'

const CHART_COLORS = ['#ff4500', '#1e90ff', '#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#fb7185']
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function DashboardPage() {
  const { profile } = useAuth()
  const { classPacks, walkIn } = useGymCatalog()
  const [stats, setStats] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [recentAttendances, setRecentAttendances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

      let active = true

      try {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startOfMonth.setHours(0, 0, 0, 0)
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        startOfToday.setHours(0, 0, 0, 0)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
        sixMonthsAgo.setHours(0, 0, 0, 0)

        const gymFilter = profile?.gym_id

        let studentsQuery = supabase
          .from('users')
          .select('id, role')
          .eq('role', 'student')
          .is('deleted_at', null)
        if (gymFilter) studentsQuery = studentsQuery.or(`gym_id.eq.${gymFilter},gym_id.is.null`)

        // Fetch timestamps (not just count) so we can build daily and weekday charts
        let attendancesMonthQuery = supabase
          .from('attendances')
          .select('attended_at, users!inner(deleted_at)')
          .is('users.deleted_at', null)
          .gte('attended_at', startOfMonth.toISOString())
          .order('attended_at', { ascending: true })
        if (gymFilter) attendancesMonthQuery = attendancesMonthQuery.eq('gym_id', gymFilter)

        // 6-month window covers current month stats and the revenue trend chart
        const paymentsExtendedQuery = supabase
          .from('payments')
          .select('id, amount, pack_type, student_id, schedule_type, paid_at')
          .gte('paid_at', sixMonthsAgo.toISOString())

        let recentQuery = supabase
          .from('attendances')
          .select('id, attended_at, users!inner(id, name, deleted_at)')
          .is('users.deleted_at', null)
          .order('attended_at', { ascending: false })
          .limit(10)
        if (gymFilter) recentQuery = recentQuery.eq('gym_id', gymFilter)

        const [
          { data: studentsData, error: studentsError },
          { data: attendancesData, error: attendancesError },
          { data: paymentsData, error: paymentsError },
          { data: recentData, error: recentError },
        ] = await Promise.all([studentsQuery, attendancesMonthQuery, paymentsExtendedQuery, recentQuery])

        if (studentsError) throw studentsError
        if (attendancesError) throw attendancesError
        if (paymentsError) throw paymentsError
        if (recentError) throw recentError
        if (!active) return

        // Students
        const studentRows = (studentsData ?? []).filter((u) => u.role === 'student')
        const validStudentIds = new Set(studentRows.map((u) => u.id))

        // Attendance: single pass to build daily and weekday maps
        const attendances = attendancesData ?? []
        const dailyCountMap = {}
        const dowCountMap = [0, 0, 0, 0, 0, 0, 0]
        const startOfTodayMs = startOfToday.getTime()
        let attendancesTodayCount = 0

        attendances.forEach((a) => {
          const d = new Date(a.attended_at)
          const day = d.getDate()
          dailyCountMap[day] = (dailyCountMap[day] || 0) + 1
          dowCountMap[d.getDay()]++
          if (d.getTime() >= startOfTodayMs) attendancesTodayCount++
        })

        // Payments: split current month vs full window
        const paymentsAll = paymentsData ?? []
        const startOfMonthMs = startOfMonth.getTime()
        const paymentsForStats = paymentsAll.filter((p) => {
          if (new Date(p.paid_at).getTime() < startOfMonthMs) return false
          return p.student_id == null ? true : validStudentIds.has(p.student_id)
        })
        const paymentsCount = paymentsForStats.length
        const paymentsTotal = paymentsForStats.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

        const packBreakdown = {}
        paymentsForStats.forEach((p) => {
          const name =
            p.student_id == null
              ? isWalkInSchedule(p.schedule_type, walkIn)
                ? 'Visitante (acceso libre)'
                : 'Sin alumno asignado'
              : (classPacks.find((x) => x.id === p.pack_type)?.name ?? p.pack_type ?? 'Otro')
          packBreakdown[name] = (packBreakdown[name] || 0) + 1
        })

        // Chart 1: daily attendance (days 1 to today)
        const todayDate = now.getDate()
        const dailyAttendance = Array.from({ length: todayDate }, (_, i) => ({
          dia: String(i + 1),
          asistencias: dailyCountMap[i + 1] ?? 0,
        }))

        // Chart 2: weekday breakdown (from this month)
        const weekdayAttendance = DAYS_SHORT.map((dia, i) => ({ dia, asistencias: dowCountMap[i] }))

        // Chart 3: monthly revenue (last 6 months, oldest → newest)
        const revenueMap = {}
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          revenueMap[`${d.getFullYear()}-${d.getMonth()}`] = {
            mes: MONTHS_SHORT[d.getMonth()],
            recaudacion: 0,
          }
        }
        paymentsAll.forEach((p) => {
          if (p.student_id != null && !validStudentIds.has(p.student_id)) return
          const d = new Date(p.paid_at)
          const key = `${d.getFullYear()}-${d.getMonth()}`
          if (revenueMap[key]) revenueMap[key].recaudacion += Number(p.amount) || 0
        })
        const monthlyRevenue = Object.values(revenueMap)

        // Chart 4: pack donut
        const packDistribution = Object.entries(packBreakdown).map(([name, value]) => ({ name, value }))

        setStats({
          studentsCount: studentRows.length,
          attendancesCount: attendances.length,
          attendancesTodayCount,
          paymentsCount,
          paymentsTotal,
        })
        setChartData({ dailyAttendance, weekdayAttendance, monthlyRevenue, packDistribution })
        setRecentAttendances(
          (recentData ?? []).map((row) => ({
            id: row.id,
            attended_at: row.attended_at,
            studentName: row.users?.name ?? '—',
          })),
        )
      } catch (err) {
        if (!active) return
        setError(toSpanishError(err, 'No se pudieron cargar las estadísticas'))
      } finally {
        if (active && !silent) setLoading(false)
      }
    },
    [profile, classPacks, walkIn],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => loadData(true))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadData(true)
      })
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  useEffect(() => {
    const id = window.setInterval(() => loadData(true), 10_000)
    return () => window.clearInterval(id)
  }, [loadData])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  const currentMonthLabel = MONTHS_SHORT[new Date().getMonth()]

  return (
    <div className="flex flex-col gap-5">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Dashboard general</h1>
          <p className="text-sm text-muted">Vista rápida de alumnos, asistencias y pagos.</p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
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

      {/* KPI cards */}
      <div className="grid shrink-0 gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Alumnos activos" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">{stats?.studentsCount ?? 0}</p>
        </StatCard>
        <StatCard label="Asistencias este mes" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-brand-500 sm:text-3xl">{stats?.attendancesCount ?? 0}</p>
        </StatCard>
        <StatCard label="Asistencias hoy" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">{stats?.attendancesTodayCount ?? 0}</p>
        </StatCard>
        <StatCard label="Pagos este mes" loading={loading}>
          <p className="font-mono text-2xl font-semibold text-ink sm:text-3xl">{stats?.paymentsCount ?? 0}</p>
          {stats?.paymentsTotal != null && stats.paymentsTotal > 0 && (
            <p className="mt-0.5 font-mono text-xs font-medium text-muted">
              ${Number(stats.paymentsTotal).toLocaleString('es-AR')} total
            </p>
          )}
        </StatCard>
      </div>

      {/* Chart row 1: daily attendance + pack donut */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Asistencias por día — {currentMonthLabel}
          </p>
          <div className="mt-3 h-36 sm:h-48">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.dailyAttendance ?? []} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3b" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: '#8e95a5'}}
                    interval={Math.max(0, Math.floor((chartData?.dailyAttendance?.length ?? 1) / 10) - 1)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8e95a5'}}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip content={<CountTooltip suffix="asistencias" />} cursor={{ fill: 'rgba(244, 245, 247, 0.06)' }} />
                  <Bar dataKey="asistencias" fill="#ff4500" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Packs contratados — {currentMonthLabel}
          </p>
          {loading ? (
            <div className="mt-3 h-36 sm:h-48">
              <DonutSkeleton />
            </div>
          ) : !chartData?.packDistribution?.length ? (
            <p className="mt-3 text-sm text-muted">Aún no hay pagos este mes.</p>
          ) : (
            <>
              <div className="mt-2 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.packDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={62}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {chartData.packDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-1 space-y-1">
                {chartData.packDistribution.map((item, i) => (
                  <li key={item.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="min-w-0 truncate text-muted" title={item.name}>
                      {item.name}
                    </span>
                    <span className="ml-auto shrink-0 font-semibold text-ink">{item.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Chart row 2: monthly revenue + weekday breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Recaudación — últimos 6 meses
          </p>
          <div className="mt-3 h-36 sm:h-48">
            {loading ? (
              <ChartSkeleton bars={6} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.monthlyRevenue ?? []} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3b" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11, fill: '#8e95a5'}}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8e95a5'}}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v) => (v === 0 ? '$0' : `$${Math.round(v / 1000)}k`)}
                  />
                  <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(244, 245, 247, 0.06)' }} />
                  <Bar dataKey="recaudacion" fill="#1e90ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Asistencias por día de semana — {currentMonthLabel}
          </p>
          <div className="mt-3 h-36 sm:h-48">
            {loading ? (
              <ChartSkeleton bars={7} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.weekdayAttendance ?? []} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3b" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: '#8e95a5'}}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8e95a5'}}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip content={<CountTooltip suffix="asistencias" />} cursor={{ fill: 'rgba(244, 245, 247, 0.06)' }} />
                  <Bar dataKey="asistencias" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent attendances */}
      <div className="card flex flex-col p-4">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
          Últimas asistencias
        </p>
        {loading ? (
          <div className="mt-3 shrink-0 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : recentAttendances.length === 0 ? (
          <p className="mt-2 shrink-0 text-sm text-muted">Sin asistencias recientes.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {recentAttendances.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 border-b border-line pb-1.5 last:border-0 last:pb-0 text-xs"
              >
                <span className="truncate font-medium text-ink">{a.studentName}</span>
                <span className="shrink-0 font-mono text-muted">{formatDateTime(a.attended_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick links */}
      <div className="shrink-0">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Accesos rápidos</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/payments" className="btn-secondary px-4 py-2 text-sm">
            Registrar pago
          </Link>
          <Link to="/app/scan" className="btn-secondary px-4 py-2 text-sm">
            Escanear QR
          </Link>
          <Link to="/app/students" className="btn-secondary px-4 py-2 text-sm">
            Ver alumnos
          </Link>
          <Link to="/app/attendance" className="btn-secondary px-4 py-2 text-sm">
            Asistencias
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, loading, children }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {loading ? <SkeletonLine /> : <div className="mt-2">{children}</div>}
    </div>
  )
}

function SkeletonLine() {
  return <div className="mt-4 h-8 w-16 animate-pulse rounded bg-surface-2" />
}

function ChartSkeleton({ bars = 12 }) {
  const heights = [40, 65, 30, 80, 55, 70, 45, 60, 35, 75, 50, 85]
  return (
    <div className="flex h-full items-end gap-1">
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t bg-surface-2"
          style={{ height: `${heights[i % heights.length]}%` }}
        />
      ))}
    </div>
  )
}

function DonutSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-28 w-28 animate-pulse rounded-full bg-surface-2" />
    </div>
  )
}

function CountTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
      <p className="font-semibold text-ink">{label}</p>
      <p className="text-brand-500">
        {payload[0].value} {suffix}
      </p>
    </div>
  )
}

function CurrencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
      <p className="font-semibold text-ink">{label}</p>
      <p className="text-accent-600">${Number(payload[0].value).toLocaleString('es-AR')}</p>
    </div>
  )
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
      <p className="font-semibold text-ink">{name}</p>
      <p className="text-brand-500">{value} {value === 1 ? 'pack' : 'packs'}</p>
    </div>
  )
}

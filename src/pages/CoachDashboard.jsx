import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { loadCoachScopedStudents, scheduleNameById } from '../utils/coachScopeStudents'
import { formatCheckinMethod } from '../utils/checkinMethodLabels'
import { formatDateTime } from '../utils/dateFormatting'
import { toSpanishError } from '../utils/errors'
import { StudentDetailModal } from '../components/StudentDetailModal'

function isSameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export function CoachDashboardPage() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [students, setStudents] = useState([])
  const [latestAttendances, setLatestAttendances] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [detailStudent, setDetailStudent] = useState(null)

  const loadData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setError(null)
    try {
      const { allowedStudentIds, students: list, assignmentRows } =
        await loadCoachScopedStudents(supabase, profile)

      if (allowedStudentIds.size === 0) {
        setAssignments(assignmentRows ?? [])
        setStudents([])
        setLatestAttendances(new Map())
        return
      }

      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('attendances')
        .select('id, student_id, attended_at, checkin_method')
        .in('student_id', [...allowedStudentIds])
        .order('attended_at', { ascending: false })
        .limit(200)

      if (attendanceError) throw attendanceError

      const latestMap = new Map()
      for (const row of attendanceRows ?? []) {
        if (!latestMap.has(row.student_id)) {
          latestMap.set(row.student_id, row)
        }
      }

      setAssignments(assignmentRows ?? [])
      setStudents(list)
      setLatestAttendances(latestMap)
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo cargar el panel'))
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { loadData() }, [loadData])

  const todayCount = useMemo(() => {
    const now = new Date()
    let count = 0
    for (const row of latestAttendances.values()) {
      if (isSameDay(row.attended_at, now)) count++
    }
    return count
  }, [latestAttendances])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Alumnos</h1>
          <p className="text-sm text-muted">
            Alumnos con pago vigente a tus horarios.
          </p>
          {!loading && students.length > 0 && (
            <p className="text-xs text-muted">
              <span className="font-medium text-ink">{students.length}</span>{' '}
              {students.length === 1 ? 'alumno' : 'alumnos'} ·{' '}
              <span className="font-medium text-ink">{todayCount}</span>{' '}
              {todayCount === 1 ? 'asistencia' : 'asistencias'} hoy
            </p>
          )}
          {!loading && assignments.length > 0 && (
            <ul className="flex flex-wrap gap-1 pt-0.5">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="rounded border border-line bg-surface px-2 py-0.5 text-[11px] text-muted"
                >
                  {scheduleNameById(a.schedule_type_id)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3 py-2 text-xs"
          disabled={loading}
          onClick={loadData}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <p className="shrink-0 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="card-muted flex min-h-0 flex-1 flex-col">
        <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
          {loading ? 'Cargando…' : `${students.length} alumno${students.length !== 1 ? 'es' : ''}`}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted">Cargando…</p>
          ) : students.length === 0 ? (
            <div className="space-y-2 text-xs text-muted">
              <p>
                {assignments.length === 0
                  ? 'No tenés horarios asignados. Pedile a un admin que te asigne uno en Profesores.'
                  : 'Todavía no figura ningún alumno con un pago registrado a tu horario.'}
              </p>
              {assignments.length > 0 && (
                <p className="rounded-lg border border-line bg-surface px-3 py-2 text-[11px] text-muted">
                  El admin debe registrar el pago en{' '}
                  <span className="font-medium">Pagos</span> eligiendo el mismo horario que el tuyo;
                  después el alumno aparecerá acá.
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-2 pr-1">
              {students.map((s) => {
                const last = latestAttendances.get(s.id)
                return (
                  <li
                    key={s.id}
                    className="cursor-pointer rounded border border-line bg-surface px-3 py-2 text-xs transition-colors hover:border-brand-500/50 hover:bg-brand-900/40"
                    onClick={() => setDetailStudent(s)}
                  >
                    <p className="font-medium text-ink">{s.name}</p>
                    <p className="text-muted">{s.email}</p>
                    <p className="text-[11px] text-muted">{s.schedule_name}</p>
                    {last ? (
                      <p className="mt-1 text-[11px] text-muted">
                        Última asistencia: {formatDateTime(last.attended_at)} ·{' '}
                        {formatCheckinMethod(last.method)}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-muted">Sin asistencias recientes</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          isAdmin={false}
          onClose={() => setDetailStudent(null)}
        />
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { loadCoachScopedStudents } from '../utils/coachScopeStudents'
import { formatCheckinMethod } from '../utils/checkinMethodLabels'
import { formatDateTime } from '../utils/dateFormatting'
import { toSpanishError } from '../utils/errors'

function isSameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export function CoachAttendancePage() {
  const { profile } = useAuth()
  const [history, setHistory] = useState([])
  const [historyScope, setHistoryScope] = useState('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setError(null)
    try {
      const { allowedStudentIds } = await loadCoachScopedStudents(supabase, profile)
      if (allowedStudentIds.size === 0) {
        setHistory([])
        return
      }

      const { data, error: attendanceError } = await supabase
        .from('attendances')
        .select('id, student_id, attended_at, checkin_method, users(name)')
        .in('student_id', [...allowedStudentIds])
        .order('attended_at', { ascending: false })
        .limit(200)

      if (attendanceError) throw attendanceError

      setHistory(
        (data ?? []).map((row) => ({
          id: row.id,
          student_id: row.student_id,
          user_name: row.users?.name ?? 'Alumno',
          attended_at: row.attended_at,
          method: row.checkin_method || 'manual',
        })),
      )
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo cargar el historial'))
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { load() }, [load])

  const todayCount = useMemo(
    () => history.filter((h) => isSameDay(h.attended_at, new Date())).length,
    [history],
  )

  const displayHistory = useMemo(() => {
    if (historyScope !== 'today') return history
    const now = new Date()
    return history.filter((h) => isSameDay(h.attended_at, now))
  }, [history, historyScope])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Asistencias</h1>
          <p className="text-sm text-slate-500">
            Asistencias de tus alumnos.
            {!loading && (
              <>
                {' '}
                <span className="font-medium text-slate-700">{todayCount}</span>{' '}
                {todayCount === 1 ? 'asistencia' : 'asistencias'} hoy.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3 py-2 text-xs"
          disabled={loading}
          onClick={load}
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="card-muted flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</p>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'all', label: 'Todas' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                className={`rounded-md px-2 py-1 font-medium transition ${
                  historyScope === s.id
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => setHistoryScope(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-400">Cargando…</p>
          ) : displayHistory.length === 0 ? (
            <p className="text-xs text-slate-500">
              {historyScope === 'today'
                ? 'Nadie registró asistencia hoy.'
                : 'Sin asistencias registradas.'}
            </p>
          ) : (
            <ul className="space-y-2 pr-1">
              {displayHistory.map((row) => (
                <li
                  key={row.id}
                  className="rounded border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <p className="font-medium text-slate-800">{row.user_name}</p>
                  <p className="text-slate-600">{formatDateTime(row.attended_at)}</p>
                  <p className="text-[11px] text-slate-500">{formatCheckinMethod(row.method)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isWalkInSchedule } from '../constants/packs'
import { SelectField } from '../components/SelectField'
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

export function CoachCheckinPage() {
  const { profile } = useAuth()
  const { walkIn } = useGymCatalog()
  const [students, setStudents] = useState([])
  const [history, setHistory] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  // Fresh DB check per-student to avoid relying on stale history
  const [freshTodayCheck, setFreshTodayCheck] = useState(false)

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  )
  const isWalkInStudent = isWalkInSchedule(selectedStudent?.schedule_type, walkIn)

  // Latest attendance of the SAME track (acceso libre o clases) — for display and stale check
  const selectedLatestAttendance = useMemo(() => {
    if (!selectedStudentId) return null
    return (
      history.find((h) => {
        if (h.student_id !== selectedStudentId) return false
        return isWalkInSchedule(h.schedule_type_id, walkIn) === isWalkInStudent
      }) ?? null
    )
  }, [history, selectedStudentId, isWalkInStudent, walkIn])

  // freshTodayCheck is the authoritative gate (type-filtered, always fresh per selection)
  const alreadyCheckedToday =
    freshTodayCheck ||
    (selectedLatestAttendance?.attended_at &&
      isSameDay(selectedLatestAttendance.attended_at, new Date()))

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setError(null)
    try {
      const { allowedStudentIds, students: list } = await loadCoachScopedStudents(supabase, profile)

      if (allowedStudentIds.size === 0) {
        setStudents([])
        setHistory([])
        return
      }

      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('attendances')
        .select('id, student_id, attended_at, checkin_method, schedule_type_id')
        .in('student_id', [...allowedStudentIds])
        .order('attended_at', { ascending: false })
        .limit(200)

      if (attendanceError) throw attendanceError

      setStudents(list)
      setHistory(
        (attendanceRows ?? []).map((row) => ({
          id: row.id,
          student_id: row.student_id,
          attended_at: row.attended_at,
          method: row.checkin_method || 'manual',
          schedule_type_id: row.schedule_type_id ?? null,
        })),
      )
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo cargar la lista de alumnos'))
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { load() }, [load])

  // Fresh per-student same-track attendance check when a student is selected.
  // Queries the DB filtered by schedule type so that acceso libre y clases
  // nunca se bloquean entre sí.
  useEffect(() => {
    setFreshTodayCheck(false)
    if (!selectedStudentId) return
    let active = true
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const student = students.find((s) => s.id === selectedStudentId)
    const isWalkIn = isWalkInSchedule(student?.schedule_type, walkIn)
    const walkInId = walkIn?.scheduleId
    let q = supabase
      .from('attendances')
      .select('id')
      .eq('student_id', selectedStudentId)
      .gte('attended_at', todayStart.toISOString())
      .limit(1)
    q = isWalkIn
      ? q.eq('schedule_type_id', walkInId)
      : walkInId
        ? q.or(`schedule_type_id.neq.${walkInId},schedule_type_id.is.null`)
        : q
    q.then(({ data }) => {
      if (active) setFreshTodayCheck((data?.length ?? 0) > 0)
    })
    return () => { active = false }
  }, [selectedStudentId, students, walkIn])

  const handleCheckin = async () => {
    if (!selectedStudentId) return
    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      if (alreadyCheckedToday) {
        throw new Error('Este alumno ya tiene asistencia registrada hoy.')
      }

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const walkInId = walkIn?.scheduleId
      let dupQuery = supabase
        .from('attendances')
        .select('id')
        .eq('student_id', selectedStudentId)
        .gte('attended_at', todayStart.toISOString())
        .limit(1)
      dupQuery = isWalkInStudent
        ? dupQuery.eq('schedule_type_id', walkInId)
        : walkInId
          ? dupQuery.or(`schedule_type_id.neq.${walkInId},schedule_type_id.is.null`)
          : dupQuery
      const { data: dupRows, error: dupError } = await dupQuery
      if (dupError) throw dupError
      if (dupRows && dupRows.length > 0) {
        throw new Error('Este alumno ya tiene asistencia registrada hoy.')
      }

      // .select('id') fuerza a PostgREST a devolver error explícito si RLS bloquea el insert
      // (sin .select(), un insert bloqueado por RLS devuelve { data: null, error: null })
      const { data: inserted, error: insertError } = await supabase
        .from('attendances')
        .insert({
          student_id: selectedStudentId,
          gym_id: profile?.gym_id ?? null,
          attended_at: new Date().toISOString(),
          checkin_method: 'manual',
          schedule_type_id: selectedStudent?.schedule_type ?? null,
        })
        .select('id')

      if (insertError) throw insertError
      if (!inserted || inserted.length === 0) {
        throw new Error(
          'La asistencia no se guardó. Verificá que tu usuario tenga los permisos necesarios (política RLS para coaches).',
        )
      }

      setSuccessMessage(`Asistencia registrada para ${selectedStudent?.name ?? 'el alumno'}.`)
      setSelectedStudentId('')
      await load()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo registrar la asistencia'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="py-2 sm:py-4">
      <div className="mx-auto max-w-sm">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Check-in Manual</h1>
        <p className="mt-1 text-sm text-muted">
          Registrá la asistencia de hoy para tus alumnos.
        </p>

        <div className="card mt-5 space-y-4">
          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-400">
              {successMessage}
            </p>
          )}

          <SelectField
            label="Alumno"
            placeholder={
              loading
                ? 'Cargando alumnos…'
                : students.length === 0
                  ? 'Sin alumnos con pago a tu horario'
                  : 'Seleccioná un alumno'
            }
            value={selectedStudentId}
            onChange={(value) => {
              setSelectedStudentId(value)
              setError(null)
              setSuccessMessage(null)
            }}
            options={students.map((s) => ({
              value: s.id,
              label: `${s.name} · ${s.schedule_name}`,
            }))}
            disabled={loading || students.length === 0}
            variant="light"
          />

          {selectedStudent && (
            <div className="rounded border border-line bg-bg px-2 py-2 text-xs text-ink">
              <p>
                <span className="font-semibold">Alumno:</span> {selectedStudent.name}
              </p>
              <p>
                <span className="font-semibold">Horario:</span> {selectedStudent.schedule_name}
              </p>
              {selectedLatestAttendance?.attended_at && (
                <p className="mt-1 text-muted">
                  <span className="font-semibold">Última asistencia:</span>{' '}
                  {formatDateTime(selectedLatestAttendance.attended_at)} (
                  {formatCheckinMethod(selectedLatestAttendance.method)})
                </p>
              )}
              {alreadyCheckedToday && (
                <p className="mt-1 text-red-400">Ya tiene asistencia hoy.</p>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!selectedStudentId || submitting || !!alreadyCheckedToday || loading}
            onClick={handleCheckin}
          >
            {submitting ? 'Registrando…' : 'Registrar asistencia'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isWalkInSchedule } from '../constants/packs'
import { SelectField } from '../components/SelectField'
import { AttendanceHistoryTable } from '../components/AttendanceHistoryTable'
import { formatCheckinMethod } from '../utils/checkinMethodLabels'
import { toSpanishError } from '../utils/errors'
import { formatDateTime, formatNow, todayInputString, dateInputToAttendedAt } from '../utils/dateFormatting'
import { DatePicker } from '../components/DatePicker'
import { BetaBadge } from '../components/BetaBadge'

function isSameDay(a, b) {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export function CheckinManualPage() {
  const { profile } = useAuth()
  const { scheduleTypes, walkIn } = useGymCatalog()
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [history, setHistory] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => todayInputString())
  const [selectedScheduleTypeId, setSelectedScheduleTypeId] = useState('')

  const todayStr = todayInputString()
  const isPastDate = selectedDate < todayStr

  const gymFilter = profile?.gym_id
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null

  const latestAttendanceForSelected = useMemo(() => {
    if (!selectedStudentId) return null
    return history.find((row) => row.student_id === selectedStudentId) ?? null
  }, [history, selectedStudentId])

  // La asistencia a registrar es "acceso libre" o "clases" según el horario elegido (o
  // "clases" por defecto si se deja sin especificar) — igual criterio que CoachCheckinPage,
  // para que acceso libre y clases nunca se bloqueen entre sí como pistas independientes.
  const isWalkInCheckin = isWalkInSchedule(selectedScheduleTypeId, walkIn)

  const alreadyCheckedOnDate = useMemo(() => {
    if (!selectedStudentId) return false
    const [y, m, d] = selectedDate.split('-').map(Number)
    const selDate = new Date(y, m - 1, d, 12, 0, 0)
    return history.some(
      (row) =>
        row.student_id === selectedStudentId &&
        isSameDay(row.attended_at, selDate) &&
        isWalkInSchedule(row.schedule_type_id, walkIn) === isWalkInCheckin,
    )
  }, [history, selectedStudentId, selectedDate, isWalkInCheckin, walkIn])

  useEffect(() => {
    let active = true

    async function loadStudents() {
      setLoadingStudents(true)
      setError(null)
      try {
        let query = supabase
          .from('users')
          .select('id, name, email, gym_id, role')
          .eq('role', 'student')
          .is('deleted_at', null)
        if (gymFilter) query = query.eq('gym_id', gymFilter)
        const { data, error } = await query.order('name', { ascending: true })
        if (error) throw error
        if (!active) return
        setStudents((data ?? []).filter((s) => s.role === 'student'))
      } catch (err) {
        if (!active) return
        setError(toSpanishError(err, 'No se pudo cargar la lista de alumnos'))
      } finally {
        if (active) setLoadingStudents(false)
      }
    }

    async function loadHistory() {
      setLoadingHistory(true)
      try {
        let query = supabase
          .from('attendances')
          .select(`id, attended_at, gym_id, checkin_method, schedule_type_id, users (id, name, deleted_at)`)
        if (gymFilter) query = query.eq('gym_id', gymFilter)
        const { data, error } = await query
          .order('attended_at', { ascending: false })
          .limit(200)
        if (error) throw error
        if (!active) return
        setHistory(
          data
            ?.filter((row) => row.users != null && row.users?.deleted_at == null)
            ?.map((row) => ({
              id: row.id,
              student_id: row.users?.id ?? null,
              attended_at: row.attended_at,
              method: formatCheckinMethod(row.checkin_method),
              schedule_type_id: row.schedule_type_id ?? null,
              user_name: row.users?.name ?? '—',
            })) ?? [],
        )
      } catch (err) {
        if (!active) return
        setError(toSpanishError(err, 'No se pudo cargar el historial'))
      } finally {
        if (active) setLoadingHistory(false)
      }
    }

    loadStudents()
    loadHistory()
    return () => { active = false }
  }, [gymFilter])

  const reloadHistory = async () => {
    setLoadingHistory(true)
    try {
      let query = supabase
        .from('attendances')
        .select(`id, attended_at, checkin_method, schedule_type_id, users (id, name, deleted_at)`)
      if (gymFilter) query = query.eq('gym_id', gymFilter)
      const { data, error } = await query
        .order('attended_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setHistory(
        data
          ?.filter((row) => row.users != null && row.users?.deleted_at == null)
          ?.map((row) => ({
            id: row.id,
            student_id: row.users?.id ?? null,
            attended_at: row.attended_at,
            method: formatCheckinMethod(row.checkin_method),
            schedule_type_id: row.schedule_type_id ?? null,
            user_name: row.users?.name ?? '—',
          })) ?? [],
      )
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo actualizar el historial'))
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleCheckIn = async () => {
    if (!selectedStudentId) return
    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      if (alreadyCheckedOnDate) {
        throw new Error('Este alumno ya tiene una asistencia registrada ese día.')
      }
      const [y, m, d] = selectedDate.split('-').map(Number)
      const dayStart = new Date(y, m - 1, d, 0, 0, 0)
      const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999)
      const walkInId = walkIn?.scheduleId
      let dupQuery = supabase
        .from('attendances')
        .select('id')
        .eq('student_id', selectedStudentId)
        .gte('attended_at', dayStart.toISOString())
        .lte('attended_at', dayEnd.toISOString())
        .limit(1)
      dupQuery = isWalkInCheckin
        ? dupQuery.eq('schedule_type_id', walkInId)
        : walkInId
          ? dupQuery.or(`schedule_type_id.neq.${walkInId},schedule_type_id.is.null`)
          : dupQuery
      const { data: dupRows, error: dupError } = await dupQuery
      if (dupError) throw dupError
      if (dupRows?.length > 0) {
        throw new Error('Este alumno ya tiene una asistencia registrada ese día.')
      }

      const attendedAt = isPastDate
        ? dateInputToAttendedAt(selectedDate)
        : new Date().toISOString()

      // schedule_slot is intentionally excluded — the column does not exist in attendances
      const payload = {
        student_id: selectedStudentId,
        attended_at: attendedAt,
        checkin_method: isPastDate ? 'retroactivo' : 'manual',
      }
      if (selectedScheduleTypeId) payload.schedule_type_id = selectedScheduleTypeId
      if (gymFilter) payload.gym_id = gymFilter

      const { error } = await supabase.from('attendances').insert([payload])
      if (error) throw error

      await reloadHistory()
      const dateLabel = isPastDate
        ? `el ${new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`
        : `a las ${formatNow()}`
      setSuccessMessage(
        `Asistencia registrada para ${selectedStudent?.name ?? 'el alumno'} ${dateLabel}.`,
      )
      setSelectedStudentId('')
      if (isPastDate) setSelectedDate(todayInputString())
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo registrar la asistencia'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex flex-col gap-2">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-ink">
          Check-in Manual
          <BetaBadge />
        </h1>
        <p className="text-sm text-muted">
          Registrá la asistencia manual eligiendo al alumno y confirmando una sola vez.
        </p>
      </div>

      {error && (
        <p className="shrink-0 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
      {successMessage && (
        <p className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-400">
          {successMessage}
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:flex-1 lg:min-h-0 lg:items-stretch">
        <div className="card shrink-0 space-y-4 lg:w-[min(100%,24rem)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Check-in manual
          </p>
          <p className="rounded-lg border border-line bg-bg px-3 py-2 text-[11px] text-muted">
            1) Seleccioná al alumno. 2) Ajustá la fecha si es una asistencia pasada. 3) Tocá en
            &quot;Registrar asistencia&quot;.
          </p>

          <SelectField
            label="Alumno"
            placeholder={loadingStudents ? 'Cargando alumnos…' : 'Seleccioná un alumno'}
            value={selectedStudentId}
            onChange={(value) => {
              setSelectedStudentId(value)
              setError(null)
              setSuccessMessage(null)
            }}
            options={students.map((s) => ({
              value: s.id,
              label: s.name || s.email || 'Sin nombre',
            }))}
            disabled={loadingStudents}
            variant="light"
          />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink">
              Fecha de asistencia
            </label>
            <DatePicker
              value={selectedDate}
              max={todayStr}
              onChange={(d) => {
                if (d) {
                  setSelectedDate(d)
                  setError(null)
                  setSuccessMessage(null)
                }
              }}
            />
          </div>

          {isPastDate && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-400">
              Registrando asistencia pasada: se guardará como &ldquo;Retroactivo&rdquo;.
            </p>
          )}

          {selectedStudent && (
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
              <p>
                <span className="font-medium text-ink">Alumno:</span>{' '}
                {selectedStudent.name || selectedStudent.email || 'Sin nombre'}
              </p>
              <p className="mt-1">
                <span className="font-medium text-ink">Última asistencia:</span>{' '}
                {latestAttendanceForSelected?.attended_at
                  ? formatDateTime(latestAttendanceForSelected.attended_at)
                  : 'Sin registros recientes'}
              </p>
              {alreadyCheckedOnDate && (
                <p className="mt-1 text-red-400">Ya tiene asistencia registrada ese día.</p>
              )}
            </div>
          )}

          <SelectField
            label="Horario (opcional)"
            placeholder="Sin especificar"
            value={selectedScheduleTypeId}
            onChange={setSelectedScheduleTypeId}
            options={[
              { value: '', label: 'Sin especificar' },
              ...(scheduleTypes ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            variant="light"
          />

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!selectedStudentId || submitting || alreadyCheckedOnDate}
            onClick={handleCheckIn}
          >
            {submitting
              ? 'Registrando…'
              : isPastDate
                ? 'Registrar asistencia pasada'
                : 'Registrar asistencia ahora'}
          </button>
        </div>

        <div className="flex h-96 flex-col lg:h-auto lg:flex-1 lg:min-h-0">
          <AttendanceHistoryTable attendances={history} loading={loadingHistory} />
        </div>
      </div>
    </div>
  )
}

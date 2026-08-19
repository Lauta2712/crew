import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { AttendanceScanView } from '../components/AttendanceScanView'
import { loadCoachScopedStudents } from '../utils/coachScopeStudents'
import { toSpanishError } from '../utils/errors'

const ESCUELA_SCHEDULE_IDS = ['escuela_multi', 'escuela_gordo', 'escuelita']

function deriveAllowedPackIds(assignmentRows, { classPacks, walkIn } = {}) {
  const scheduleIds = (assignmentRows ?? []).map((r) => r.schedule_type_id)
  if (scheduleIds.length === 0) return []
  const allowed = new Set()
  if (walkIn?.scheduleId && scheduleIds.includes(walkIn.scheduleId)) {
    const unlimitedPack = (classPacks ?? []).find((p) => p.unlimited)
    if (unlimitedPack) allowed.add(unlimitedPack.id)
    if (walkIn.dailyPackId) allowed.add(walkIn.dailyPackId)
  }
  if (scheduleIds.includes('grupo_entrenamiento')) {
    allowed.add('grupo_entrenamiento')
  }
  if (scheduleIds.some((id) => ESCUELA_SCHEDULE_IDS.includes(id))) {
    allowed.add('single')
    allowed.add('pack4')
    allowed.add('pack8')
  }
  return [...allowed]
}

export function CoachScanPage() {
  const { profile, isCoach } = useAuth()
  const { classPacks, scheduleTypes, walkIn } = useGymCatalog()
  const [students, setStudents] = useState([])
  const [allowedStudentIds, setAllowedStudentIds] = useState(() => new Set())
  const [assignmentRows, setAssignmentRows] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const allowedPackIds = useMemo(
    () => deriveAllowedPackIds(assignmentRows, { classPacks, walkIn }),
    [assignmentRows, classPacks, walkIn],
  )

  useEffect(() => {
    if (!isCoach || !profile?.id) return
    let active = true

    async function load() {
      setLoadingStudents(true)
      setLoadError(null)
      try {
        const {
          allowedStudentIds: ids,
          students: list,
          assignmentRows: rows,
        } = await loadCoachScopedStudents(supabase, profile, { scheduleTypes })
        if (!active) return
        setAllowedStudentIds(ids)
        setStudents(list)
        setAssignmentRows(rows)
      } catch (err) {
        if (!active) return
        setLoadError(toSpanishError(err, 'No se pudo cargar los alumnos'))
        setStudents([])
        setAllowedStudentIds(new Set())
        setAssignmentRows([])
      } finally {
        if (active) setLoadingStudents(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [isCoach, profile, scheduleTypes])

  if (!isCoach) {
    return (
      <p className="text-sm text-red-400">
        Solo los profesores pueden usar esta pantalla.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {loadError}
        </p>
      )}
      <AttendanceScanView
        allowedStudentIds={allowedStudentIds}
        allowedPackIds={allowedPackIds}
        students={students}
        loadingStudents={loadingStudents}
        title="Escanear QR — profesor"
        subtitle="Solo podés registrar alumnos de tus horarios asignados (con pago registrado a ese horario). Misma validación de pack y clases que en recepción."
      />
    </div>
  )
}

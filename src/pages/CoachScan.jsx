import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { AttendanceScanView } from '../components/AttendanceScanView'
import { loadCoachScopedStudents } from '../utils/coachScopeStudents'
import { toSpanishError } from '../utils/errors'

/**
 * Un coach puede escanear cualquier pack pagado a UNO de sus horarios asignados
 * (coach_assignments.schedule_type_id) — sin importar de qué gimnasio sea ni qué
 * ids de pack/horario use su catálogo. Reemplaza la comparación anterior contra
 * ids de pack hardcodeados de Crux (single/pack4/pack8/grupo_entrenamiento), que
 * dejaba a cualquier gimnasio con catálogo custom sin ningún pack autorizado.
 */
function deriveAllowedScheduleTypeIds(assignmentRows) {
  return new Set((assignmentRows ?? []).map((r) => r.schedule_type_id).filter(Boolean))
}

export function CoachScanPage() {
  const { profile, isCoach } = useAuth()
  const { scheduleTypes } = useGymCatalog()
  const [students, setStudents] = useState([])
  const [allowedStudentIds, setAllowedStudentIds] = useState(() => new Set())
  const [assignmentRows, setAssignmentRows] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const allowedScheduleTypeIds = useMemo(
    () => deriveAllowedScheduleTypeIds(assignmentRows),
    [assignmentRows],
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
        allowedScheduleTypeIds={allowedScheduleTypeIds}
        students={students}
        loadingStudents={loadingStudents}
        title="Escanear QR (profesor)"
        subtitle="Solo podés registrar alumnos de tus horarios asignados (con pago registrado a ese horario). Misma validación de pack y clases que en recepción."
      />
    </div>
  )
}

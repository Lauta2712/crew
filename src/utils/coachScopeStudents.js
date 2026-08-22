import { SCHEDULE_TYPES } from '../constants/packs'

export function scheduleNameById(id, scheduleTypes = SCHEDULE_TYPES) {
  return scheduleTypes.find((s) => s.id === id)?.name ?? id
}

function latestPaymentByStudent(payments) {
  const map = new Map()
  for (const row of payments ?? []) {
    const prev = map.get(row.student_id)
    if (!prev || new Date(row.paid_at) > new Date(prev.paid_at)) {
      map.set(row.student_id, row)
    }
  }
  return map
}

/**
 * Alumnos con pago reciente en los horarios asignados al profesor.
 * @returns {{ allowedStudentIds: Set<string>, students: Array<{id: string, name: string, email: string, schedule_type?: string|null, schedule_name?: string}>, assignmentRows: object[] }}
 */
/**
 * @param {{ scheduleTypes?: typeof import('../constants/packs').SCHEDULE_TYPES }} [options]
 */
export async function loadCoachScopedStudents(supabase, profile, options = {}) {
  const scheduleTypes = options.scheduleTypes ?? SCHEDULE_TYPES
  if (!profile?.id) {
    return { allowedStudentIds: new Set(), students: [], assignmentRows: [] }
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('coach_assignments')
    .select('id, schedule_type_id, gym_id')
    .eq('coach_id', profile.id)

  if (assignmentError) throw assignmentError

  const scheduleIds = [...new Set((assignmentRows ?? []).map((a) => a.schedule_type_id))]
  if (scheduleIds.length === 0) {
    return { allowedStudentIds: new Set(), students: [], assignmentRows: assignmentRows ?? [] }
  }

  let usersQuery = supabase
    .from('users')
    .select('id, name, email, role, deleted_at, gym_id')
    .eq('role', 'student')
    .is('deleted_at', null)

  if (profile.gym_id) {
    usersQuery = usersQuery.eq('gym_id', profile.gym_id)
  }

  // Only include payments made within the last month (1-month validity window)
  const validFrom = new Date()
  validFrom.setMonth(validFrom.getMonth() - 1)

  const [{ data: allStudents, error: studentsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      usersQuery.order('name', { ascending: true }),
      supabase
        .from('payments')
        .select('id, student_id, schedule_type, paid_at')
        .in('schedule_type', scheduleIds)
        .gte('paid_at', validFrom.toISOString())
        .order('paid_at', { ascending: false })
        .limit(500),
    ])

  if (studentsError) throw studentsError
  if (paymentsError) throw paymentsError

  const latestByStudent = latestPaymentByStudent(payments)
  const allowedStudentIds = new Set([...latestByStudent.keys()])
  const students = (allStudents ?? [])
    .filter((s) => allowedStudentIds.has(s.id))
    .map((s) => {
      const p = latestByStudent.get(s.id)
      return {
        id: s.id,
        name: s.name ?? s.email ?? 'Alumno',
        email: s.email ?? '',
        schedule_type: p?.schedule_type ?? null,
        schedule_name: scheduleNameById(p?.schedule_type, scheduleTypes),
      }
    })

  return {
    allowedStudentIds,
    students,
    assignmentRows: assignmentRows ?? [],
  }
}

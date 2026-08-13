import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { AttendanceScanView } from '../components/AttendanceScanView'

export function AdminScanPage() {
  const { profile, isAdmin } = useAuth()
  const gymFilter = profile?.gym_id

  const [students, setStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    let active = true

    async function loadStudents() {
      setLoadingStudents(true)
      try {
        let query = supabase
          .from('users')
          .select('id, name, email, gym_id, role')
          .eq('role', 'student')
          .is('deleted_at', null)

        if (gymFilter) {
          query = query.or(`gym_id.eq.${gymFilter},gym_id.is.null`)
        }

        const { data, error } = await query.order('name', { ascending: true })
        if (error) throw error
        if (!active) return
        setStudents((data ?? []).filter((s) => s.role === 'student'))
      } catch {
        if (active) setStudents([])
      } finally {
        if (active) setLoadingStudents(false)
      }
    }

    loadStudents()
    return () => {
      active = false
    }
  }, [isAdmin, gymFilter])

  if (!isAdmin) {
    return (
      <p className="text-sm text-red-600">
        Solo los administradores pueden usar esta pantalla.
      </p>
    )
  }

  return (
    <AttendanceScanView
      allowedStudentIds={null}
      students={students}
      loadingStudents={loadingStudents}
      cameraOnly
      title="Escanear QR"
      subtitle="Apuntá la cámara al código QR del alumno para registrar la asistencia automáticamente."
    />
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { toSpanishError } from '../utils/errors'
import { formatDate } from '../utils/dateFormatting'

// Nota: asumimos que en el futuro habrá una tabla "courses".
// Mientras tanto, esta página no romperá: mostrará un mensaje si la tabla no existe.

export function StudentCoursesPage() {
  const { profile } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        // Intentamos leer cursos; si la tabla no existe, Supabase devolverá error.
        let query = supabase.from('courses').select('*').order('start_date', {
          ascending: true,
        })

        if (profile?.gym_id) {
          query = query.eq('gym_id', profile.gym_id)
        }

        const { data, error } = await query
        if (error) throw error
        if (!active) return
        setCourses(data ?? [])
      } catch (err) {
        if (!active) return
        setError(
          toSpanishError(
            err,
            'No se pudieron cargar los cursos (verifica que exista la tabla "courses").',
          ),
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCourses()

    return () => {
      active = false
    }
  }, [profile])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Cursos</h1>
        <p className="text-sm text-muted">
          Próximos cursos y clínicas que dictará el gimnasio.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {loading
          ? Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="card">
                <div className="h-16 animate-pulse rounded bg-surface-2" />
              </div>
            ))
          : courses.length === 0 && !error
            ? (
              <p className="text-sm text-muted">
                Aún no hay cursos publicados. Consulta las redes del gimnasio
                para enterarte de las próximas fechas.
              </p>
              )
            : courses.map((course) => (
                <div key={course.id} className="card">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {course.level ?? 'General'}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-ink">
                    {course.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {course.description}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Fecha:{' '}
                    <span className="font-medium">
                      {course.start_date
                        ? formatDate(course.start_date)
                        : 'A confirmar'}
                    </span>
                  </p>
                </div>
              ))}
      </div>
    </div>
  )
}


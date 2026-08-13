import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Lanzamos un error temprano para facilitar el diagnóstico en desarrollo
  // (en producción normalmente se configurará correctamente el entorno)
  // eslint-disable-next-line no-console
  console.error(
    'Supabase no está configurado. Asegúrate de definir VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env.local.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Ejemplos de consultas típicas con el cliente de Supabase:
//
// 1) Obtener estudiantes con su plan y métricas de asistencia del mes actual
//
// const startOfMonth = new Date()
// startOfMonth.setDate(1)
// startOfMonth.setHours(0, 0, 0, 0)
//
// const { data: students, error } = await supabase
//   .from('users')
//   .select(
//     `
//       id,
//       name,
//       role,
//       gyms ( id, name ),
//       subscriptions (
//         id,
//         plans ( id, name, classes_per_month )
//       ),
//       attendances:attendances (
//         id,
//         attended_at
//       )
//     `,
//   )
//   .eq('role', 'student')
//   .gte('attendances.attended_at', startOfMonth.toISOString())
//
// 2) Registrar una asistencia manual
//
// const { error: insertError } = await supabase.from('attendances').insert([
//   {
//     student_id: studentId,      // columna real: student_id (no user_id)
//     gym_id: gymId,
//     attended_at: new Date().toISOString(),
//     checkin_method: 'manual',   // columna real: checkin_method (no method)
//   },
// ])
//
// 3) Historial de asistencias con nombre de estudiante
//
// const { data: history, error: historyError } = await supabase
//   .from('attendances')
//   .select(
//     `
//       id,
//       attended_at,
//       checkin_method,
//       users (
//         id,
//         name
//       )
//     `,
//   )
//   .order('attended_at', { ascending: false })
//   .limit(200)


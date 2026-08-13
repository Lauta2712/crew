/**
 * Setup global de datos de prueba.
 * Corre UNA VEZ antes de todos los tests E2E.
 * Crea un gimnasio, un admin y un alumno en el Supabase local.
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

export const TEST_GYM_ID    = '00000000-0000-0000-0000-000000000001'
export const ADMIN_EMAIL    = 'admin@test.crux'
export const ADMIN_PASSWORD = 'Test123456!'
export const STUDENT_NAME   = 'Alumno Test'
export const STUDENT_EMAIL  = 'student@test.crux'
export const STUDENT_PASSWORD = 'Test123456!'

export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Faltan variables en .env.test.local: VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // --- Gimnasio de prueba ---
  await supabase.from('gyms').upsert({ id: TEST_GYM_ID, name: 'Crux Test' })

  // --- Admin ---
  let adminId
  const { data: existingAdmin } = await supabase.auth.admin.listUsers()
  const alreadyAdmin = existingAdmin?.users?.find((u) => u.email === ADMIN_EMAIL)

  if (alreadyAdmin) {
    adminId = alreadyAdmin.id
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`No se pudo crear el admin: ${error.message}`)
    adminId = data.user.id
  }

  await supabase.from('users').upsert({
    id: adminId,
    name: 'Admin Test',
    email: ADMIN_EMAIL,
    role: 'admin',
    gym_id: TEST_GYM_ID,
  })

  // --- Alumno ---
  let studentId
  const alreadyStudent = existingAdmin?.users?.find((u) => u.email === STUDENT_EMAIL)

  if (alreadyStudent) {
    studentId = alreadyStudent.id
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`No se pudo crear el alumno: ${error.message}`)
    studentId = data.user.id
  }

  await supabase.from('users').upsert({
    id: studentId,
    name: STUDENT_NAME,
    email: STUDENT_EMAIL,
    role: 'student',
    gym_id: TEST_GYM_ID,
  })

  // Guarda los IDs para que los tests puedan leerlos
  mkdirSync(resolve('e2e/.fixtures'), { recursive: true })
  writeFileSync(
    resolve('e2e/.fixtures/test-data.json'),
    JSON.stringify({ studentId, gymId: TEST_GYM_ID }, null, 2),
  )

  console.log('✓ Datos de prueba listos (admin + alumno + gimnasio)')
}

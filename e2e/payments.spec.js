/**
 * Tests E2E del flujo de registro de pagos.
 * Usa la sesión de admin guardada por auth.setup.js.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function getTestData() {
  try {
    return JSON.parse(readFileSync(resolve('e2e/.fixtures/test-data.json'), 'utf-8'))
  } catch {
    throw new Error('Corré los tests primero para generar e2e/.fixtures/test-data.json')
  }
}

// Borra pagos del alumno de prueba para que cada test arranque limpio
async function limpiarPagos(studentId) {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  await supabase.from('payments').delete().eq('student_id', studentId)
}

// Helper: abre un SelectField por su atributo aria-haspopup y el texto del placeholder
async function selectOption(page, placeholderText, optionText) {
  await page
    .locator('button[aria-haspopup="listbox"]', { hasText: placeholderText })
    .click()
  await page.getByRole('option', { name: optionText, exact: true }).click()
}

test.describe('Registro de pagos — Escuelas', () => {
  test.beforeAll(async () => {
    const { studentId } = getTestData()
    await limpiarPagos(studentId)
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/app/payments')
    await expect(page.getByRole('heading', { name: 'Registrar pagos' })).toBeVisible()
    // Espera a que cargue la lista de alumnos
    await expect(
      page.locator('button[aria-haspopup="listbox"]', { hasText: 'Seleccionar estudiante' }),
    ).toBeVisible()
  })

  test('registra un pago de pack4 para escuela', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Escuelas' })).toHaveAttribute('aria-selected', 'true')

    await selectOption(page, 'Seleccionar estudiante', 'Alumno Test')
    await selectOption(page, 'Seleccionar pack', 'Pack 4 clases mensuales · $27.000')
    await selectOption(page, 'Seleccionar horario', 'Escuela (Profe Multi)')
    // escuela_multi tiene 2 turnos — hay que elegir uno para habilitar el botón
    await selectOption(page, 'Seleccionar turno', 'Lunes y Miércoles · 9:00 – 10:30')

    await page.getByRole('button', { name: 'Registrar pago' }).click()

    await expect(page.getByText('Pago registrado correctamente.')).toBeVisible({
      timeout: 8_000,
    })
  })

  test('muestra error si se intenta registrar el mismo horario dos veces en el mes', async ({ page }) => {
    // El test anterior ya registró un pago para escuela_multi. Intentamos otro.
    await selectOption(page, 'Seleccionar estudiante', 'Alumno Test')
    await selectOption(page, 'Seleccionar pack', 'Pack 4 clases mensuales · $27.000')
    await selectOption(page, 'Seleccionar horario', 'Escuela (Profe Multi)')
    await selectOption(page, 'Seleccionar turno', 'Lunes y Miércoles · 9:00 – 10:30')
    await page.getByRole('button', { name: 'Registrar pago' }).click()

    await expect(page.getByText(/Ya hay un pago registrado para este horario/)).toBeVisible({
      timeout: 8_000,
    })
  })
})

test.describe('Registro de pagos — Grupo de entrenamiento', () => {
  test.beforeAll(async () => {
    // Limpia pagos para que no haya conflicto con pagos de escuela del describe anterior
    const { studentId } = getTestData()
    await limpiarPagos(studentId)
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/app/payments')
    await page.getByRole('tab', { name: 'Grupo entrenamiento' }).click()
    await expect(
      page.locator('button[aria-haspopup="listbox"]', { hasText: 'Seleccionar estudiante' }),
    ).toBeVisible()
  })

  test('registra un pago de grupo de entrenamiento', async ({ page }) => {
    await selectOption(page, 'Seleccionar estudiante', 'Alumno Test')
    await page.getByRole('button', { name: 'Registrar pago de grupo' }).click()

    await expect(
      page.getByText('Pago de grupo de entrenamiento registrado.'),
    ).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Registro de pagos — Muro libre', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/payments')
    await page.getByRole('tab', { name: 'Muro libre' }).click()
  })

  test('muestra el formulario de muro libre', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Muro libre' })).toBeVisible()
  })
})

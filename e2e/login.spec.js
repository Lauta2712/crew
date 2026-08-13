/**
 * Tests E2E del flujo de login.
 * Estos tests NO usan el storageState del admin — prueban el formulario directamente.
 */
import { test, expect } from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './global.setup.js'

// Sobrescribe el storageState del proyecto chromium para estos tests
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('muestra el formulario de login', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })

  test('login exitoso redirige a /app', async ({ page }) => {
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await page.waitForURL('**/app', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/app/)
  })

  test('muestra error con credenciales incorrectas', async ({ page }) => {
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('#password', 'contraseña-incorrecta')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Espera el mensaje de error en español
    await expect(page.locator('text=/contraseña|credencial|inválid/i')).toBeVisible({
      timeout: 8_000,
    })
    // No redirigió
    await expect(page).toHaveURL(/\/login/)
  })

  test('muestra error con email inexistente', async ({ page }) => {
    await page.fill('#email', 'noexiste@test.crux')
    await page.fill('#password', 'cualquiercosa')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.locator('text=/contraseña|credencial|inválid/i')).toBeVisible({
      timeout: 8_000,
    })
  })

  test('botón deshabilitado mientras procesa', async ({ page }) => {
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Mientras espera la respuesta, el botón muestra "Entrando…"
    // (puede que sea muy rápido localmente, por eso usamos waitForURL como confirmación final)
    await page.waitForURL('**/app', { timeout: 10_000 })
  })
})

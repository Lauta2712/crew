/**
 * Hace login como admin y guarda el estado del browser (cookies + localStorage).
 * El resto de los tests arrancan pre-autenticados gracias a esto.
 */
import { test as setup, expect } from '@playwright/test'
import { mkdirSync } from 'fs'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './global.setup.js'

const AUTH_FILE = 'e2e/.auth/admin.json'

setup('autenticar como admin', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // Espera a que la redirección a /app se complete
  await page.waitForURL('**/app', { timeout: 10_000 })
  await expect(page).toHaveURL(/\/app/)

  mkdirSync('e2e/.auth', { recursive: true })
  await page.context().storageState({ path: AUTH_FILE })
})

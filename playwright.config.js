import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'

// Carga .env.test.local para que globalSetup tenga acceso a las keys
if (existsSync('.env.test.local')) {
  for (const line of readFileSync('.env.test.local', 'utf-8').split('\n')) {
    const match = line.match(/^([^#=][^=]*)=(.*)$/)
    if (match) process.env[match[1].trim()] ??= match[2].trim()
  }
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.js',
  fullyParallel: false, // los tests E2E comparten datos de prueba
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    // 1. Paso de autenticación: hace login y guarda el estado del browser
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.js/,
    },
    // 2. Tests que requieren sesión de admin
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['auth-setup'],
      testIgnore: /auth\.setup\.js/,
    },
  ],

  // Arranca el servidor de desarrollo apuntando al Supabase local
  webServer: {
    command: 'npx vite --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})

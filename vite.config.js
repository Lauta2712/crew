/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // El manifest de PWA se genera en build time — no se puede resolver en runtime como el
  // resto del tema (ver src/utils/theme.js). Mismos defaults genéricos que el resto de la
  // app (VITE_GYM_DISPLAY_NAME etc.) cuando no hay env vars configuradas para este deploy.
  const env = loadEnv(mode, '.', 'VITE_')
  const gymName = env.VITE_GYM_DISPLAY_NAME?.trim() || 'Crew'
  const shortName = gymName.length > 12 ? `${gymName.slice(0, 11)}…` : gymName
  const themeColor = env.VITE_THEME_PRIMARY_COLOR?.trim() || '#ff4500'
  const customLogoUrl = env.VITE_THEME_LOGO_URL?.trim()
  const logoIcon = customLogoUrl || '/favicon.svg'
  // El logo por defecto es SVG; el de un gimnasio via env var es una URL arbitraria (hoy siempre tratada como jpeg).
  const logoIconType = customLogoUrl ? 'image/jpeg' : 'image/svg+xml'

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['crux_logo.jpg', 'favicon.svg', 'icons.svg'],
        manifest: {
          name: gymName,
          short_name: shortName,
          description: `Sistema de asistencias y gestión — ${gymName}`,
          theme_color: themeColor,
          background_color: '#0b0c10',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: logoIcon,
              sizes: '512x512',
              type: logoIconType,
            },
            {
              src: logoIcon,
              sizes: '192x192',
              type: logoIconType,
            },
            {
              src: logoIcon,
              sizes: '512x512',
              type: logoIconType,
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      css: true,
      exclude: ['**/node_modules/**', '**/e2e/**'],
    },
  }
})

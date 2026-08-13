import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, applyBrandChrome } from './utils/theme'
import { GYM_DISPLAY_NAME, THEME_LOGO_URL } from './constants/gym'

// Tema de bootstrap del deploy (mismo patrón que VITE_GYM_DISPLAY_NAME): aplica antes de
// montar React para que Landing/Login ya se vean con la marca correcta sin sesión aún.
// GymSettingsContext lo vuelve a aplicar (y puede pisarlo) una vez resuelto el gym_id.
const bootstrapPrimaryColor = import.meta.env.VITE_THEME_PRIMARY_COLOR?.trim() || undefined
applyTheme({
  primaryColor: bootstrapPrimaryColor,
  accentColor: import.meta.env.VITE_THEME_ACCENT_COLOR?.trim() || undefined,
  font: import.meta.env.VITE_THEME_FONT?.trim() || undefined,
})

// Título de pestaña, favicon y theme-color: index.html trae los valores base del producto
// como fallback visual estático (flash mínimo antes de este script, inevitable sin SSR).
applyBrandChrome({
  name: GYM_DISPLAY_NAME,
  logoUrl: THEME_LOGO_URL ?? undefined,
  primaryColor: bootstrapPrimaryColor,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

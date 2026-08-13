/** ID del gimnasio por defecto de este deploy. Todos los nuevos estudiantes se asignan a este gimnasio. */
export const DEFAULT_GYM_ID = '0c758fed-a971-4051-ab3d-77e3363d18da'

/**
 * Nombre de marca para páginas públicas sin sesión (Landing, Login), donde todavía no hay
 * `profile.gym_id` resuelto para leer `gyms.name` desde la DB. En páginas autenticadas se usa
 * en cambio `useGymCatalog().gymName` (GymSettingsContext), que sí lee el nombre real del gym.
 */
export const GYM_DISPLAY_NAME = import.meta.env.VITE_GYM_DISPLAY_NAME?.trim() || 'Tu gimnasio'

/**
 * URL de logo para páginas públicas sin sesión (Landing, Login) — mismo motivo que
 * `GYM_DISPLAY_NAME`: ahí no hay `profile.gym_id` resuelto para leer `theme.logoUrl` desde
 * `gym_settings`. `null` cuando no está seteada: los componentes caen al logo de Crux
 * empaquetado (`crux_logo.jpg`). En páginas autenticadas se usa en cambio
 * `useGymCatalog().theme.logoUrl` (GymSettingsContext).
 */
export const THEME_LOGO_URL = import.meta.env.VITE_THEME_LOGO_URL?.trim() || null

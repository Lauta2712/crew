# CLAUDE.md — crux-admin

Panel de administración para **Crux Escalada**, un gimnasio de escalada. Gestiona asistencia, pagos y planes de los alumnos, con acceso diferenciado por rol.

## Stack

- **React 19** + **Vite** — SPA con HMR rápido
- **React Router v7** — Enrutado client-side con rutas protegidas por rol
- **Tailwind CSS v4** — Utility-first, colores de marca en `tailwind.config.js`. Las utilidades de color `brand-*` pueden no resolverse en todos los contextos; para colores críticos usar clases CSS explícitas en `src/index.css` (patrón: `.cal-day-selected`, `.btn-primary`).
- **Supabase** — Postgres + Auth + Realtime + Edge Functions (`@supabase/supabase-js` v2)
- **jsQR** / **react-qr-code** — Escaneo y generación de QR
- **Vitest** + **React Testing Library** — Tests unitarios/integración
- **Vercel** — Deploy (SPA rewrite en `vercel.json`)

## Variables de entorno

Definidas en `.env.local` (no se commitea):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_CREATE_COACH_FUNCTION=coach_assignments
VITE_GYM_DISPLAY_NAME=
VITE_THEME_PRIMARY_COLOR=
VITE_THEME_ACCENT_COLOR=
VITE_THEME_FONT=
VITE_THEME_LOGO_URL=
```

`VITE_GYM_DISPLAY_NAME` — nombre de marca mostrado en las páginas públicas sin sesión (`Landing`, `Login`), donde todavía no hay `profile.gym_id` resuelto para leer `gyms.name` desde la DB. Si no está seteada, cae a un texto genérico (`"Tu gimnasio"`). En páginas autenticadas se usa en cambio `useGymCatalog().gymName` (lee el nombre real desde la tabla `gyms`). Ver `src/constants/gym.js`.

`VITE_THEME_PRIMARY_COLOR` / `VITE_THEME_ACCENT_COLOR` / `VITE_THEME_FONT` / `VITE_THEME_LOGO_URL` — identidad visual de bootstrap (aplicada en `main.jsx` antes de montar React, para que Landing/Login ya se vean con la marca del deploy, y en `vite.config.js` para el manifest de PWA — ese sí solo se resuelve en build time). Un gimnasio con sesión puede pisar color/fuente/logo vía `gym_settings.data.theme` desde Configuración — ver `src/utils/theme.js` (`applyTheme`, `applyBrandChrome`, `deriveColorScale`) y `src/contexts/GymSettingsContext.jsx`. Sin ninguna de estas variables ni `theme` configurado, la app usa la paleta de Crux tal cual (defaults literales en `src/index.css`).

**Importante:** poné los valores hex de `VITE_THEME_PRIMARY_COLOR`/`VITE_THEME_ACCENT_COLOR` entre comillas (`VITE_THEME_PRIMARY_COLOR="#3a91a5"`) — sin comillas, el `#` se interpreta como inicio de comentario y la variable queda vacía.

## Comandos

```bash
npm run dev        # Servidor de desarrollo
npm run build      # Build de producción
npm run preview    # Preview del build
npm run test       # Vitest en modo watch (unit tests)
npm run test:run   # Vitest una sola pasada
npm run test:e2e   # Playwright E2E (requiere Supabase local corriendo)
npm run lint       # ESLint
```

> Para los tests E2E ver `TESTING.md` — requiere Docker + Supabase local + `.env.test.local`.

## Arquitectura

### Roles de usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Panel completo: alumnos, asistencia, pagos, coaches, configuración, check-in manual, escáner QR |
| `coach` | Escáner QR limitado a sus alumnos + cobros de muro libre |
| `student` | Vista personal: horario, planes, calendario, perfil + QR propio |

### Flujo de autenticación

- **`useAuth` hook** (`src/hooks/useAuth.jsx`) — contexto global de sesión. Detecta rol, maneja cuentas bloqueadas, refresca tokens.
- **`ProtectedRoute`** (`src/components/ProtectedRoute.jsx`) — guarda de rutas; redirige si no hay sesión o el rol no tiene acceso.
- Las rutas bajo `/app` requieren sesión activa. Dentro de `/app`, algunas rutas requieren `requireAdmin` o rol específico.

### Estructura de rutas

```
/               → Landing pública
/login          → Login / Registro
/app            → Shell con sidebar (Layout.jsx)
  /app                    → Dashboard (admin) o StudentDashboard / CoachDashboard
  /app/students           → Listado + info de alumnos (admin) — solo lectura, sin registro de pagos
  /app/attendance         → Historial de asistencia (admin) — solo lectura, links a check-in y QR
  /app/checkin-manual     → Registro manual de asistencia (admin) — alumno + fecha, sin validación de pack
  /app/scan               → Escáner QR cámara (admin) — solo cámara, sin panel manual
  /app/payments           → Registro de pagos: Escuelas / Muro libre / Grupo (admin)
  /app/coaches            → Gestión de coaches (admin)
  /app/configuration      → Configuración del gimnasio (admin)
  /app/coach/scan         → Escáner QR con alternativa manual (coach)
  /app/coach/cobros-muro  → Cobros muro libre (coach)
  /app/schedule           → Horarios (student)
  /app/packs              → Planes (student)
  /app/calendar           → Calendario mensual (student)
  /app/courses            → Cursos (student)
  /app/profile            → Perfil + QR personal (student)
  /app/qr                 → QR Clases/Grupo (student)
  /app/muro-qr            → QR Muro libre (student)
```

### Filosofía de navegación admin

Cada función tiene **una sola pestaña** — no se duplican acciones en múltiples páginas:
- **Asistencias** → historial únicamente
- **Check-in Manual** → único punto de registro manual (sin validación de pack)
- **Escanear QR** → única entrada de cámara QR (sin panel manual)
- **Pagos** → único punto de registro de pagos (Escuelas / Muro libre / Grupo)
- **Estudiantes** → solo información/historial, sin registro de pagos inline

### Contextos y estado global

- **`useAuth`** — sesión, perfil, rol. Consumir con `useAuth()` en cualquier componente.
- **`GymSettingsContext`** (`src/contexts/GymSettingsContext.jsx`) — configuración del gimnasio (precios, tipos de horario). Se fusiona con los defaults de `src/constants/`.

### Supabase

- Cliente singleton en `src/services/supabaseClient.js`.
- Realtime activo en el Dashboard para `attendances`, `users`, `payments`.
- Edge Functions invocadas con `invokeEdgeFunctionWithUserJwt()` (`src/utils/edgeFunctions.js`).

### Constantes de dominio

- `src/constants/gym.js` — `DEFAULT_GYM_ID`
- `src/constants/packs.js` — `CLASS_PACKS`, `SCHEDULE_TYPES`, precios

## Patrones a seguir

### Badge de estado en la Sidebar

Cualquier ítem de navegación puede mostrar una etiqueta sutil junto al nombre. Se agrega el campo `badge` al objeto del nav array en `Layout.jsx`:

```js
{ name: 'Mi Feature', to: '/app/mi-feature', icon: '✨', badge: 'Nuevo' }
```

**Valores recomendados y cuándo usarlos:**

| Badge | Cuándo usarlo |
|-------|---------------|
| `'Beta'` | Funcionalidad parcialmente probada, puede cambiar. Para features en prueba activa con usuarios reales. |
| `'Nuevo'` | Feature recién lanzada, completamente funcional. Retirar después de 2–4 semanas cuando los usuarios ya la conocen. |
| `'Test'` | Feature experimental o en desarrollo activo, puede romperse. |
| `'Próximo'` | Feature deshabilitada o aún no disponible (nav deshabilitado con `disabled`). |

**Reglas:**
- Aplica a **todos los roles** (admin, coach, student) por igual.
- El badge se muestra en la sidebar desktop y en el drawer mobile automáticamente.
- Quitar el badge cuando la feature deje de ser nueva/experimental — no acumular badges viejos.
- Si una feature sale de beta o deja de ser nueva, eliminar el campo `badge` del objeto.
- No inventar nuevas palabras para el badge — usar solo las de la tabla de arriba para mantener consistencia visual.

**Implementación:** el render es único en `Layout.jsx` (`{item.badge && <span>...</span>}`). No duplicar lógica de badge en páginas individuales.

---

- **Errores en español**: usar `toSpanishError()` de `src/utils/errors.js` para mensajes al usuario.
- **Exportación CSV**: `downloadStudentsListCsv()` en `src/utils/csvExport.js`.
- **Política de asistencia**: validación de check-ins dobles en `src/utils/attendancePolicy.js`.
- **QR scanning**: lógica centralizada en `src/components/AttendanceScanView.jsx` (video → canvas → jsQR). Acepta prop `cameraOnly` para ocultar el panel manual (usado en admin); el panel manual queda visible para coaches.
- **Selector custom**: usar siempre `SelectField` (`src/components/SelectField.jsx`) con `variant="light"` para formularios sobre fondo blanco. Nunca `<select>` nativo.
- **DatePicker**: `src/components/DatePicker.jsx`. Estados del día (seleccionado, hoy) definidos con clases CSS explícitas `.cal-day-selected` / `.cal-day-today` en `src/index.css` — no usar utilidades `bg-brand-*` para esto.
- No hay librería de componentes externa — los UI components son propios en `src/components/`.
- Las páginas manejan su propia carga de datos (no hay store global como Redux).

## Base de datos (esquema inferido)

| Tabla | Descripción |
|-------|-------------|
| `gyms` | Registro del gimnasio |
| `users` | Perfiles (id, name, email, role, gym_id, blocked, deleted_at) |
| `plans` | Planes de clases |
| `subscriptions` | Alumno → Plan |
| `attendances` | Registros de asistencia (student_id, attended_at, checkin_method, schedule_type_id, gym_id) |
| `payments` | Pagos (student_id, amount, pack_type, schedule_type, paid_at) |
| `gym_settings` | Configuración JSON del gimnasio |
| `courses` | Cursos disponibles |

### Columnas que NO existen en `attendances`

- `schedule_slot` — **no existe**. No incluir en inserts. Solo existe `schedule_type_id`.

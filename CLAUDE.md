# CLAUDE.md — Crew

Panel de administración para gimnasios boutique (escalada, crossfit, yoga, funcional, etc.). Gestiona asistencia, pagos y planes de los alumnos, con acceso diferenciado por rol. Construido sobre la infraestructura de un proyecto anterior a medida para un gimnasio de escalada (Crux Escalada, hoy discontinuado) — ver `docs/ROADMAP_WHITELABEL.md` para el historial de la generalización.

> ⚠️ **RLS: nunca usar `gym_id IS NULL` como comodín "visible para todos los gimnasios".**
> Hasta el 2026-08-21 varias policies (`attendances`, `payments`, `subscriptions`, `users`,
> `gym_settings`, `gyms`, `plans`, `courses`, `student_projects`) trataban un `gym_id` nulo
> (del admin/coach que consulta, o de la fila consultada) como "mostrar/permitir de
> cualquier gimnasio" — con un solo gimnasio real esto era inofensivo, con gimnasios
> clientes reales es fuga de datos entre tenants. Se corrigió en la migración
> `20260821000000_close_gym_id_null_rls_wildcard.sql` (todas las policies ahora comparan
> `gym_id` con igualdad estricta) — ver también el mismo patrón que se sacó del frontend
> (`.or('gym_id.eq.X,gym_id.is.null')` en Students.jsx/AdminPayments.jsx/AdminScan.jsx/
> CheckinManual.jsx/Coaches.jsx/AdminConfiguration.jsx/Dashboard.jsx/WalkInPaymentsForm.jsx/
> coachScopeStudents.js) y el auto-migrado silencioso de alumnos con `gym_id` nulo a
> `DEFAULT_GYM_ID` que había en `useAuth.jsx` (hubiera vuelto a mezclar alumnos de un
> gimnasio nuevo con los de Crux). Si en el futuro hace falta un caso real de "contenido
> compartido entre gimnasios", modelarlo explícito (ej. un flag `is_shared`), nunca con
> `gym_id IS NULL` implícito.

> ⚠️ **Multi-tenant, no un deploy por gimnasio.** Este único proyecto/deploy (una sola instancia de la app, un solo Supabase) está pensado para vender **suscripciones a N gimnasios distintos** (escalada, gym normal, crossfit, funcional, yoga...), cada uno como una fila en `gyms` con su propio `gym_id`. **No asumir nunca que "este deploy" es para un gimnasio específico** — antes de tratar cualquier contenido (nombre, packs, horarios, precios) como "el contenido real de este gimnasio", verificar cuántas filas hay en `gyms` (hoy, en desarrollo, solo hay una: la de pruebas). Por la misma razón, **ningún dato específico de un gimnasio (nombres de clases, precios, horarios) debe hardcodearse como default compartido** en `src/constants/` — ver el contenido de Crux Escalada todavía hardcodeado en `CLASS_PACKS`/`SCHEDULE_TYPES` (`src/constants/packs.js`) como ejemplo de lo que NO hay que repetir. El alta de cada gimnasio cliente (fila en `gyms` + cuenta admin) es manual hoy (Fase 3 de `docs/ROADMAP_WHITELABEL.md`, sin onboarding self-serve todavía), y el registro público de alumnos (`Login.jsx` → `signUpWithEmail`) todavía asigna a todos los que se registran al mismo `DEFAULT_GYM_ID` (`src/constants/gym.js`) — no hay todavía selección de gimnasio en el alta, es una tarea pendiente de esa misma fase.

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

`VITE_GYM_DISPLAY_NAME` — nombre de marca mostrado en las páginas públicas sin sesión (`Landing`, `Login`), donde todavía no hay `profile.gym_id` resuelto para leer `gyms.name` desde la DB. Si no está seteada, cae al nombre del producto (`"Crew"`). En páginas autenticadas se usa en cambio `useGymCatalog().gymName` (lee el nombre real desde la tabla `gyms`). Ver `src/constants/gym.js`.

`VITE_THEME_PRIMARY_COLOR` / `VITE_THEME_ACCENT_COLOR` / `VITE_THEME_FONT` / `VITE_THEME_LOGO_URL` — identidad visual de bootstrap (aplicada en `main.jsx` antes de montar React, para que Landing/Login ya se vean con la marca del deploy, y en `vite.config.js` para el manifest de PWA — ese sí solo se resuelve en build time). Un gimnasio con sesión puede pisar color/fuente/logo vía `gym_settings.data.theme` desde Configuración — ver `src/utils/theme.js` (`applyTheme`, `applyBrandChrome`, `deriveColorScale`) y `src/contexts/GymSettingsContext.jsx`. Sin ninguna de estas variables ni `theme` configurado, la app usa la paleta base del producto (defaults literales en `src/index.css`: rojo `#c1432b`, Work Sans / Big Shoulders Display / JetBrains Mono).

**Importante:** poné los valores hex de `VITE_THEME_PRIMARY_COLOR`/`VITE_THEME_ACCENT_COLOR` entre comillas (`VITE_THEME_PRIMARY_COLOR="#3a91a5"`) — sin comillas, el `#` se interpreta como inicio de comentario y la variable queda vacía.

### Suscripción al producto (cobro a dueños de gimnasio, no a alumnos)

Distinto de todo lo anterior: `crew_subscriptions` (tabla) + `create-crew-checkout` /
`crew-subscription-webhook` (Edge Functions) manejan el cobro recurrente de **la
suscripción a Crew en sí** vía Mercado Pago (preapproval), mostrado en la sección de
precios de `Landing.jsx` (`src/components/CrewPricingSection.jsx`). No confundir con
`payments`/`subscriptions`, que son los pagos que un alumno le hace a SU gimnasio.

Precios definidos en `src/constants/subscriptionPlans.js` (duplicados server-side en
`create-crew-checkout/index.ts` a propósito — nunca confiar en un precio mandado por el
cliente). Secrets de Edge Function (configurar en el dashboard de Supabase, **no** en
`.env.local` — no llevan prefijo `VITE_` porque no deben llegar al frontend):

```
MP_ACCESS_TOKEN=       # access token de Mercado Pago
CREW_SITE_URL=         # dominio público, para el back_url post-pago
```

Sin `MP_ACCESS_TOKEN` configurado, `create-crew-checkout` responde `501` con un mensaje
claro en vez de romper — pensado para poder deployar antes de tener las credenciales
reales de Mercado Pago.

`MP_ACCESS_TOKEN` y `CREW_SITE_URL` ya están configurados como secrets de Edge Function
en el proyecto Supabase "CREW" — probado de punta a punta (hay una suscripción de
prueba con `status = 'authorized'` en `crew_subscriptions`, generada el 2026-08-21).

Tras completar el pago, Mercado Pago redirige a `/crew/gracias` (`src/pages/CrewThankYou.jsx`,
ruta pública) — no consulta el estado real, solo confirma que el pago se envió y que el
equipo va a escribir para coordinar el alta.

El alta del gimnasio (fila en `gyms`, cuenta admin) sigue siendo manual una vez que el
webhook marca la suscripción como `authorized` — no hay onboarding self-serve todavía
(Fase 3 de `docs/ROADMAP_WHITELABEL.md`, sin empezar). Para que el superadmin sepa quién
pagó, `SuperAdminDashboard.jsx` lista las filas de `crew_subscriptions` vía la Edge
Function de solo lectura `list-crew-subscriptions` (la tabla no tiene ninguna policy RLS
para `authenticated`, solo `service_role` la lee — ver
`supabase/functions/list-crew-subscriptions/README.md`); el botón "Crear gimnasio" de
cada fila navega a `/app/superadmin/gyms/new` precargando nombre/email de contacto vía
`location.state` (`SuperAdminNewGym.jsx`), para no tener que retipearlos a mano.

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
| `superadmin` | Gestión interna de Crew (no es un rol de gimnasio cliente): Dashboard global de solo lectura con gimnasios, alumnos y pagos de **todos** los gimnasios (`src/pages/SuperAdminDashboard.jsx`). `gym_id = NULL`. Puede dar de alta gimnasios nuevos (tenant + primera cuenta admin) desde `/app/superadmin/gyms/new` (`src/pages/SuperAdminNewGym.jsx`, Edge Function `create-gym-admin`), pausar/reactivar un gimnasio existente (`gyms.paused_at`, botón en `SuperAdminDashboard.jsx`, policy `gyms_update_superadmin`) — un gimnasio pausado bloquea el login de su admin/coach/student (`useAuth.jsx`) sin borrar sus datos — y **"modo soporte"**: botón "Ingresar" en cada fila de `SuperAdminDashboard.jsx` que loguea al superadmin como el admin más antiguo activo de ese gimnasio, vía Edge Function `login-as-gym-admin` (genera un magic-link token con `auth.admin.generateLink`, sin conocer la contraseña) + `supabase.auth.verifyOtp()` en el cliente. Si el gimnasio no tiene ningún admin activo (p. ej. alta manual por SQL incompleta), la función autoprovisiona uno de soporte en vez de bloquear al superadmin: email `<local-del-superadmin>+support-<gymId corto>@<dominio>`, nombre `Soporte — <gimnasio>` — no hace falta que reciba correo real porque el login nunca manda un mail. Ver `supabase/functions/login-as-gym-admin/README.md`. Deshabilitado si el gimnasio está pausado (el login se cortaría igual por el bloqueo de `useAuth.jsx`). La sesión de superadmin original se guarda en `sessionStorage` (`src/utils/supportMode.js`) antes de canjear el token — el banner "Volver a superadmin" en `Layout.jsx` la restaura con `setSession()` sin pedir contraseña de nuevo. Como Supabase comparte la sesión activa entre pestañas del mismo navegador (localStorage), esto reemplaza la sesión en TODAS las pestañas abiertas — no hay superadmin-en-una-pestaña + admin-en-otra simultáneo. Convertir a un usuario en `superadmin` en sí sigue siendo manual por SQL (`UPDATE users SET role='superadmin', gym_id=NULL WHERE email=...`) — sin self-serve, a propósito. Modo soporte da permisos completos de admin sobre ESE gimnasio mientras dura la sesión (ya no es "sin permisos de escritura"); no hay todavía registro/auditoría de cuándo un superadmin entró a qué gimnasio. |

### Flujo de autenticación

- **`useAuth` hook** (`src/hooks/useAuth.jsx`) — contexto global de sesión. Detecta rol, maneja cuentas bloqueadas, refresca tokens.
- **`ProtectedRoute`** (`src/components/ProtectedRoute.jsx`) — guarda de rutas; redirige si no hay sesión o el rol no tiene acceso.
- Las rutas bajo `/app` requieren sesión activa. Dentro de `/app`, algunas rutas requieren `requireAdmin` o rol específico.

### Estructura de rutas

```
/                       → Landing pública
/login                  → Login / Registro
/crew/gracias           → Post-checkout de la suscripción a Crew (back_url de Mercado Pago)
/app                    → Shell con sidebar (Layout.jsx)
  /app                        → Dashboard (admin) / StudentDashboard / CoachDashboard / SuperAdminDashboard según rol
  /app/students                → Listado + info de alumnos (admin) — solo lectura, sin registro de pagos
  /app/attendance               → Historial de asistencia (admin) — solo lectura, links a check-in y QR
  /app/checkin-manual           → Registro manual de asistencia (admin) — alumno + fecha, sin validación de pack
  /app/scan                     → Escáner QR cámara (admin) — solo cámara, sin panel manual
  /app/payments                 → Registro de pagos: Escuelas / Acceso libre / Grupo (admin)
  /app/coaches                  → Gestión de coaches (admin)
  /app/configuration            → Configuración del gimnasio (admin)
  /app/coach/asistencias        → Historial de asistencia (coach, solo lectura)
  /app/coach/checkin            → Check-in manual (coach)
  /app/coach/scan                → Escáner QR con alternativa manual (coach)
  /app/coach/cobros-libre        → Cobros acceso libre (coach)
  /app/schedule                 → Horarios (student)
  /app/calendar                  → Calendario mensual (student)
  /app/courses                   → Cursos (student)
  /app/profile                   → Perfil (student)
  /app/qr                        → QR Clases/Grupo (student)
  /app/walkin-qr                 → QR Acceso libre (student)
  /app/superadmin/gyms/new       → Alta de gimnasio nuevo (superadmin)
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

- **Esperas que merecen explicación**: usar `WaitModal` (`src/components/WaitModal.jsx`) — modal bloqueante con spinner + título + mensaje opcional, para cualquier rol. No es para cualquier loading (un botón con texto "Guardando…" alcanza para operaciones de un solo paso); es para esperas donde al usuario le sirve saber *qué* está pasando detrás (ej. una operación con varios pasos en el backend, o que puede autoprovisionar/crear algo). Ejemplo: `handleLoginAsAdmin` en `SuperAdminDashboard.jsx` lo usa mientras `login-as-gym-admin` puede estar autoprovisionando una cuenta admin de soporte.
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

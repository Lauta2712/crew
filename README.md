# Crux Escalada · Sistema de asistencias (MVP)

Aplicación web para gestionar asistencias, planes y alumnos de **Crux Escalada**, pensada para uso diario del **entrenador/admin** y consulta de los **alumnos**.

Este proyecto es un MVP funcional listo para desplegar en producción (por ejemplo, en Vercel) conectado a una base de datos de Supabase.

---

## Tecnologías usadas

### Frontend

- **Vite + React 19**: SPA rápida, con rutas protegidas y separación por roles.
- **React Router**: navegación entre:
  - Landing pública
  - Panel `/app` con vistas para admin y alumnos
  - Login / Registro
- **CSS + Tailwind base**:
  - Se importa `tailwindcss` para utilidades (`flex`, `grid`, `gap`, etc.).
  - Estilos propios en `src/index.css` para componentes base (`card`, `btn-primary`, etc.) con la paleta y tipografía de Crux.
- **Nunito (Google Fonts)**: tipografía redondeada para acompañar la estética del gimnasio.
- **jsQR**: lectura de códigos QR desde la cámara en el panel de admin.
- **QR estático por alumno**: el QR se genera como imagen usando un servicio externo (`api.qrserver.com`) a partir de un JSON con el `student_id`.

### Backend / Infra

- **Supabase**:
  - **Auth (auth.users)** para registro/login por correo y contraseña.
  - **Base de datos Postgres** para las tablas:
    - `gyms`
    - `users`
    - `plans`
    - `subscriptions`
    - `attendances`
    - `payments`
    - tablas opcionales sugeridas: `student_projects`, `courses`, `checkin_sessions`.
  - Cliente JS: `@supabase/supabase-js` inicializado en `src/services/supabaseClient.js` usando:
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_ANON_KEY`

---

## Arquitectura general

- `src/services/supabaseClient.js`:
  - Crea el cliente de Supabase y contiene ejemplos de consultas.
- `src/hooks/useAuth.jsx`:
  - Hook global de autenticación:
    - Obtiene la sesión actual desde Supabase.
    - Busca el perfil en `public.users` usando el mismo `id` que `auth.users`.
    - Expone:
      - `session`, `user`, `profile`
      - `isAdmin`, `isStudent`
      - `signInWithEmail`, `signUpWithEmail`, `signOut`
- `src/components/Layout.jsx`:
  - Shell principal del panel `/app`:
    - Sidebar con logo, navegación por rol y botón de salir.
    - Contenido central adaptado a desktop y mobile.
- `src/components/ProtectedRoute.jsx`:
  - Protege rutas por autenticación y, opcionalmente, por rol admin.

### Rutas principales

- `/` → `LandingPage` (pública):
  - Explica los formatos: **Muro libre**, **Escuela para adultos**, **Grupo de entrenamiento**, **Escuela para niños**.
  - Botón “Ingresar al panel” → `/login`.
- `/login` → `LoginPage`:
  - Permite **iniciar sesión** o **crear cuenta**.
  - Tras login/registro correcto, redirige a `/app`.
- `/app` → `AppHomePage`:
  - Si es **admin** → `DashboardPage`.
  - Si es **alumno** → `StudentDashboardPage`.

Dentro de `/app`:

- **Vistas alumno**:
  - `/app` → resumen de plan y clases del mes.
  - `/app/schedule` → `StudentSchedulePage` (horarios de clases).
  - `/app/packs` → `StudentPacksPage` (planes/planes de Supabase).
  - `/app/calendar` → `StudentCalendarPage` (pagos + asistencias del mes).
  - `/app/courses` → `StudentCoursesPage` (lista de cursos; puede depender de una tabla `courses`).
  - `/app/profile` → `StudentProfilePage`:
    - Edita `name` y `phone` en `users`.
    - Lista proyectos personales de escalada (`student_projects`).
    - Muestra el QR personal de asistencia.

- **Vistas admin**:
  - `/app` (mismo index) → `DashboardPage`:
    - Estudiantes activos.
    - Asistencias del mes.
  - `/app/students` → `StudentsPage`:
    - Tabla con:
      - Nombre
      - Plan
      - Clases por mes
      - Usadas en el mes
      - Restantes
    - Calcula métricas usando `subscriptions`, `plans` y `attendances`.
  - `/app/attendance` → `AttendancePage`:
    - Combo de estudiantes + botón “Registrar asistencia” (inserta en `attendances`).
    - Historial reciente de asistencias con nombre del alumno y método.
  - `/app/scan` → `AdminScanPage`:
    - **Escaneo con cámara** usando jsQR.
    - Opción de ingreso manual del contenido del QR (JSON).

---

## Idea del sistema y flujo de uso

### Roles

- **Admin / Entrenador**:
  - Controla el sistema, registra asistencias y administra alumnos y planes.
  - Accede a vistas de administración (`Dashboard`, `Estudiantes`, `Asistencias`, `Escanear QR`).
  - Se marca `role = 'admin'` en la tabla `users`.
- **Alumno**:
  - Consulta su plan, sus clases utilizadas, su calendario y sus proyectos.
  - Accede a las vistas de alumno (`Inicio`, `Horarios`, `Packs de clases`, `Calendario`, `Cursos`, `Perfil`).
  - Se marca `role = 'student'` en `users`.

### Registro y login

- El alumno o entrenador puede **crear su cuenta** desde el propio login:
  - `supabase.auth.signUp({ email, password })`.
  - Se asegura la existencia del perfil en `public.users` con un `upsert` usando el `id` de `auth.users`.
- El entrenador puede luego cambiar el `role` del usuario a `admin` desde la consola de Supabase.

### Registro de asistencias

Hay dos formas de marcar una asistencia:

1. **Manual (desde Asistencias)**:
   - El admin elige un alumno en un `<select>` y pulsa “Registrar asistencia”.
   - Se inserta en `attendances` una fila:
     - `student_id`
     - `gym_id` (si el admin lo tiene definido)
     - `attended_at` = fecha/hora actual
     - `method` = `'manual'`

2. **QR personal por alumno (desde Escanear QR)**:
   - Cada alumno tiene un QR en su perfil, que codifica un JSON:
     - `{ type: "attendance", student_id: "<uuid>" }`
   - El entrenador abre `/app/scan` en su móvil:
     - Activa la cámara y apunta al QR.
     - jsQR lee el contenido; si es válido, se inserta una asistencia con:
       - `checkin_method = 'qr_camera'`.
   - Si la cámara no está disponible, el admin puede usar el **ingreso manual** del mismo JSON.

### Cálculo de clases por mes

En `StudentsPage` y en el dashboard del alumno:

- Se obtiene el plan actual a través de `subscriptions` → `plans`.
- Se calcula:
  - `classes_per_month` desde `plans.classes_per_month`.
  - `usedThisMonth` contando filas de `attendances` del mes actual.
  - `classes_remaining` = `classes_per_month - usedThisMonth` (mínimo 0).

---

## Buenas prácticas y decisiones de diseño

- **Separación de responsabilidades**:
  - Cliente de Supabase en `services/`.
  - Lógica de auth en un hook dedicado (`useAuth`).
  - Vistas organizadas en `pages/` y componentes reutilizables en `components/`.
- **Control de roles en frontend**:
  - `ProtectedRoute` redirige a `/login` si no hay sesión.
  - `ProtectedRoute requireAdmin` restringe vistas sensibles a admins.
  - El layout muestra navegación distinta según `isAdmin` / `isStudent`.
- **UX enfocada en casos de uso reales**:
  - **Admin móvil**:
    - Vista de Escanear QR pensada para usar desde el celular con pocos toques.
  - **Alumno**:
    - Vistas compactas, sin scroll innecesario.
    - Calendario de mes completo visible de un vistazo.
  - Landing clara para personas que aún no usan el sistema.
- **Estilo y branding**:
  - Paleta inspirada en el logo de Crux (celeste pastel, grises suaves y acento amarillo).
  - Logo presente en:
    - Landing
    - Login
    - Sidebar del panel
    - Barra superior en mobile
    - Favicon en la pestaña del navegador.
- **Seguridad básica**:
  - Contraseñas gestionadas solo por Supabase Auth (no se guarda `password` en `public.users`).
  - QR no contiene información sensible:
    - Solo `student_id` y un campo `type`.
    - Solo un admin autenticado puede registrar asistencias con ese QR.

---

## Configuración rápida para desarrollo

1. Clonar el repositorio y entrar en el directorio.
2. Instalar dependencias:

```bash
npm install
```

3. Crear `.env.local` en la raíz:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

4. Ejecutar en desarrollo:

```bash
npm run dev
```

5. Crear en Supabase al menos:
   - Un usuario con `role = 'admin'` en `public.users`.
   - Uno o más alumnos con `role = 'student'`, algún `plan` y `subscription`.

---

## Próximos pasos posibles

- Vista de **gestión de cursos** más completa para admin (`courses`).
- Panel de **reportes** (asistencias por semana, evolución de alumnos).
- Políticas RLS avanzadas en Supabase para multigimnasio.
- Escaneo de QR más robusto (tokens de un solo uso o con expiración mediante `checkin_sessions`).

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

# Prompt: Generar un sistema frontend genérico (admin + alumnos)

Usa este prompt para generar desde cero un **frontend** con la misma arquitectura, stack y patrones de UX que un sistema de gestión de asistencias y pagos para un centro/negocio con roles Admin y Estudiante (o equivalente). El sistema debe ser **genérico**: nombres de producto y branding configurables, dominios adaptables (gimnasio, academia, club, etc.).

---

## Objetivo

Crear una **SPA (Single Page Application)** que permita:

- **Rol Admin:** gestionar usuarios (estudiantes/alumnos), registrar asistencias (manual y por QR), registrar pagos por período/pack, ver dashboard con métricas y escanear códigos QR de alumnos.
- **Rol Estudiante/Alumno:** ver su inicio con resumen (clases del mes, asistencias), horarios y packs, calendario, perfil y un **QR personal** con vigencia ligada al último pago.

La app debe ser responsive (móvil primero donde aplique), con diseño claro y accesible.

---

## Stack técnico obligatorio

- **React** (con hooks).
- **Vite** como bundler.
- **React Router** (rutas anidadas, rutas protegidas).
- **Tailwind CSS** (v4 o 3) para estilos; diseño con utilidades, sin librería de componentes.
- **Supabase** como backend (Auth + Realtime/Postgres). Las tablas y RLS no se generan en este prompt; el frontend asume que existen tablas como: `users` (con `role`, `deleted_at`, `gym_id` si hay multi-tenant), `attendances`, `payments`, `subscriptions`, `plans`, etc., y que la autenticación devuelve sesión con usuario identificado.

Opcional pero recomendable: **jsQR** (o similar) para decodificar QR desde cámara en la vista de escaneo.

---

## Estructura de rutas

- **Públicas:** landing (`/`), login (`/login`).
- **Protegidas (requieren sesión):** bajo un layout común (sidebar + área principal):
  - **Ruta base:** `/app` (home según rol).
  - **Vistas “estudiante”:** por ejemplo `/app`, `/app/schedule`, `/app/calendar`, `/app/courses`, `/app/profile`.
  - **Vistas “admin”:** `/app/students`, `/app/attendance`, `/app/payments`, `/app/scan`.
- Las rutas solo-admin deben estar protegidas con un guard (ej. `ProtectedRoute` con `requireAdmin`) que redirija si el usuario no es admin.

---

## Layout y navegación

- **Desktop:** sidebar fijo a la izquierda con logo, menú de navegación (NavLink con estado activo), y bloque inferior con datos del usuario y botón “Cerrar sesión”.
- **Móvil:** header con botón hamburguesa y logo; al abrir, drawer desde la izquierda con el mismo menú y datos de usuario. Cerrar drawer al elegir una ruta o al hacer clic fuera.
- El menú debe cambiar según el rol (admin ve: Dashboard, Estudiantes, Asistencias, Pagos, Escanear QR; estudiante ve: Inicio, Horarios, Calendario, Cursos, Perfil). Nombres y rutas deben ser genéricos y fáciles de renombrar (ej. “Estudiantes” → “Alumnos”, “Pagos” → “Cobros”).

---

## Patrones de UI/UX a replicar

1. **Fondo global:** cuerpo con fondo claro (ej. gradiente suave o color sólido tipo `#f4fbfc`), tipografía sans-serif (ej. Nunito o similar).
2. **Cards:** contenedores con bordes redondeados (ej. `rounded-2xl` o `rounded-xl`), borde sutil, sombra ligera. Variante “muted” para bloques secundarios.
3. **Botones:** primario (relleno, gradiente o color sólido, hover con ligera elevación); secundario (outline o fondo blanco). Estado disabled con opacidad reducida.
4. **Formularios:** labels pequeños en mayúsculas o peso medio; inputs con borde, padding y `border-radius`. En móvil, inputs con `font-size` mínimo 16px para evitar zoom en iOS.
5. **Selectores custom:** en lugar de `<select>` nativo, usar un componente tipo “dropdown” (botón que abre lista absoluta) con **bordes redondeados** en el desplegable y variante “light” para fondos claros y “dark” para fondos oscuros. Evitar listas con bordes cuadrados en móvil.
6. **Tablas:** en desktop, tabla clásica con thead/tbody; en **móvil**, reemplazar por **lista de tarjetas** (una tarjeta por fila con la misma información) para evitar scroll horizontal.
7. **Mensajes:** errores en borde/fondo rojo suave; éxitos en verde. Texto legible y tamaño acorde (ej. `text-xs` o `text-sm`).
8. **Contenedores flex:** usar `min-w-0` en contenedores flex y en inputs dentro de flex para evitar desbordes en móvil (sobre todo en iOS).

---

## Funcionalidades por vista (genéricas)

### Landing
- Hero con título y descripción del producto; sección de características o packs; enlaces a login o registro si aplica. Contenido parametrizable (nombre del negocio, textos).

### Login
- Formulario email + contraseña; integración con Supabase Auth. Redirección a `/app` tras login exitoso. Manejo de errores en pantalla.

### Dashboard / Home (según rol)
- **Admin:** tarjetas con métricas (número de estudiantes activos, asistencias del mes). Solo contar usuarios con `role` estudiante y `deleted_at` nulo.
- **Estudiante:** resumen de su plan/pack, clases usadas en el mes, clases restantes (datos desde subscriptions/attendances/payments según tu modelo).

### Estudiantes (solo admin)
- Listado de estudiantes (tabla en desktop, cards en móvil si aplica). Columnas: nombre, email, datos relevantes (ej. clases restantes, último pago). Filtro por gym si hay multi-tenant.
- Acciones: editar, bloquear, **eliminar**. Eliminación = **soft delete** (actualizar `deleted_at` en `users`). No borrar físicamente.
- Modal o drawer para “Registrar pago” por estudiante: selector de estudiante, pack, horario/tipo, fecha de pago. Validar un pago por estudiante por mes (o por período que definas). Al guardar, opcionalmente crear/actualizar suscripción.
- En todas las consultas que listen “estudiantes”, **filtrar siempre por `deleted_at` nulo** para no mostrar ni contar eliminados.

### Asistencias (solo admin)
- **Check-in manual:** selector (dropdown) de estudiante (solo no eliminados), botón “Registrar asistencia”. Insertar en `attendances` con `user_id` o `student_id`, `gym_id`, `attended_at`, método “manual”.
- **Historial reciente:** lista de últimas asistencias (estudiante, fecha, método). En desktop: tabla; en móvil: lista de tarjetas sin scroll horizontal. Si el usuario asociado a una asistencia está eliminado (`deleted_at` no nulo), mostrar en nombre “Estudiante eliminado” (o equivalente) en lugar del nombre real.

### Pagos (solo admin)
- Formulario: estudiante (solo no eliminados), pack, horario/tipo, fecha de pago. Botón “Registrar pago”. Validación: máximo un pago por estudiante por mes (o por período). Insertar en `payments` y opcionalmente sincronizar `subscriptions`/`plans`. Mensajes de éxito y error claros.
- Selector de fecha con buen comportamiento en móvil (sin desbordar del formulario).

### Escanear QR (solo admin)
- Opción de abrir cámara y decodificar QR, o pegar manualmente el contenido del código. El payload esperado es un JSON con al menos: `type: 'attendance'`, `student_id` (UUID). Opcional: `valid_until` (ISO string).
- Validaciones antes de insertar asistencia:  
  - Payload válido y `student_id` presente.  
  - Si existe `valid_until`, comprobar que la fecha actual no sea posterior (si no, mensaje “QR vencido”).  
  - Comprobar que el usuario exista y que **no** esté eliminado (`deleted_at` nulo); si está eliminado, mostrar “El alumno fue dado de baja” y no insertar.
- Tras validar, insertar en `attendances` y mostrar éxito.

### Horarios / Packs (estudiante)
- Vista informativa de horarios y de packs/planes (lectura). Resaltar el pack o horario del estudiante si está disponible (ej. último pago o suscripción activa).

### Calendario (estudiante)
- Vista de calendario mensual con días de pago, asistencias y/o clases del pack según datos de `payments` y `attendances`.

### Perfil (estudiante)
- Edición de nombre, teléfono (y lo que expongas). Bloque de “QR de asistencia”:
  - Solo mostrar el QR si el estudiante tiene **al menos un pago** y la vigencia del último pago no ha expirado (ej. vigencia = fin del mes del último `paid_at`).
  - Si no hay pago vigente: mensaje “Pagá tu pack para habilitar el QR” (o equivalente).
  - El QR debe incluir en el payload: `type: 'attendance'`, `student_id`, y **`valid_until`** (fin del mes del último pago en ISO). Mostrar debajo del QR la fecha “Válido hasta dd/mm/yyyy”.
- Generar el QR como imagen (URL a API de QR o librería cliente) con el JSON stringificado.

---

## Reglas de negocio a respetar en el frontend

1. **Soft delete:** en todas las listas y selectores de “estudiantes” o “usuarios alumnos”, filtrar por `deleted_at` nulo. En historiales (ej. asistencias), si el usuario está eliminado, mostrar un texto tipo “Estudiante eliminado” en lugar del nombre.
2. **Un pago por estudiante por período:** en el formulario de pagos (y al registrar pago desde estudiantes), validar contra la base que no exista ya un pago para ese estudiante en el mismo mes (o período definido).
3. **Vigencia del QR:** igual a la vigencia del pack (ej. fin del mes del último pago). El QR solo se muestra si hay pago vigente; al escanear, si viene `valid_until`, rechazar si la fecha actual es posterior.
4. **Responsive y accesibilidad:** sin scroll horizontal en listas/tablas en móvil; inputs y controles táctiles con tamaño adecuado; contraste y textos legibles.

---

## Entregables esperados

- Código fuente del frontend (React + Vite + Tailwind + React Router).
- Estructura de carpetas clara: `pages/`, `components/`, `hooks/`, `services/`, `constants/` (o equivalente).
- Nombres de marca y textos clave parametrizables (constantes o env) para que el sistema sea “genérico” y reutilizable en otro negocio (gimnasio, academia, club, etc.).
- README con instrucciones de instalación, variables de entorno (Supabase URL y anon key) y cómo ejecutar en dev y build.

---

## Notas opcionales

- Si el backend usa `user_id` en `attendances` en lugar de `student_id`, adaptar los inserts y la documentación interna para mantener consistencia.
- Considerar un archivo de constantes para “packs” y “horarios” (ids, nombres, precios) si no vienen de la API, para facilitar cambiar nombres y precios sin tocar lógica.
- Mantener un único componente de Select/dropdown reutilizable con variantes (light/dark) para mantener la misma apariencia en todas las pantallas (formularios claros y oscuros).

# Guía de Testing — crux-admin

## Resumen

El proyecto tiene dos capas de tests:

| Capa | Herramienta | Qué cubre | Comando |
|------|-------------|-----------|---------|
| Unit / integración | Vitest + RTL | Lógica de negocio pura y utils con Supabase mockeado | `npm run test` |
| E2E | Playwright | Flujos reales en el browser contra Supabase local | `npm run test:e2e` |

---

## Parte 1 — Supabase local con Docker

### Por qué

Los tests E2E necesitan operar contra una base de datos real. Usar producción contaminaría los datos. El Supabase local corre todo en Docker: Postgres, Auth, Storage y Edge Functions.

### Requisitos

- **Docker Desktop** corriendo con backend WSL 2
- **Supabase CLI** instalado como dev dependency (`npm install supabase --save-dev`)

### Setup inicial (se hace una sola vez)

```bash
# 1. Inicializar la carpeta supabase/ en el proyecto
npx supabase init

# 2. Autenticarse en Supabase cloud
npx supabase login

# 3. Vincular con el proyecto remoto (el ID está en Supabase dashboard > Settings > General)
npx supabase link --project-ref <project-id>

# 4. Descargar el schema actual de producción como migración base
npx supabase db dump -f supabase/migrations/20250101000000_initial_schema.sql

# 5. Arrancar el stack local (descarga imágenes Docker ~2-3 GB la primera vez)
npx supabase start

# 6. Aplicar las migraciones al Supabase local
npx supabase db reset
```

> **Nota sobre el schema dump:** Si el dump genera errores de política RLS duplicada al correr `db reset`, asegurate de que las otras migraciones no recrean las mismas políticas. Si es así, mové las migraciones conflictivas a `supabase/migrations/archive/` — el dump ya captura el estado final.

### URLs del Supabase local

Aparecen al correr `npx supabase start` o `npx supabase status`:

| Servicio | URL |
|----------|-----|
| API (para el cliente JS) | `http://127.0.0.1:54321` |
| Studio (dashboard local) | `http://127.0.0.1:54323` |
| Base de datos | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

### Variables de entorno para tests

Archivo `.env.test.local` (no se commitea — está en `.gitignore`):

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # de `npx supabase status` → anon public
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...     # de `npx supabase status` → secret
VITE_SUPABASE_CREATE_COACH_FUNCTION=coach_assignments
```

Vitest carga `.env.test.local` automáticamente porque corre en modo `test`.  
Playwright lo carga manualmente al inicio de `playwright.config.js`.

### Comandos del día a día

```bash
npx supabase start      # arrancar (Docker debe estar corriendo)
npx supabase stop       # parar (conserva los datos)
npx supabase db reset   # resetear DB al estado de las migraciones (borra datos locales)
npx supabase status     # ver URLs y keys actuales
```

### Agregar una nueva migración

Cuando cambiás el schema en producción (via Supabase dashboard), para sincronizar localmente:

```bash
npx supabase db pull    # genera una nueva migración con los cambios
npx supabase db reset   # aplica todo desde cero
```

---

## Parte 2 — Tests unitarios (Vitest)

### Archivos

```
src/utils/
  attendancePolicy.test.js        # computeAttendancePolicy
  manualPaymentInsert.test.js     # assertPaymentAllowedThisMonth
  resolveManualPaymentRow.test.js # resolveManualPaymentRow, shouldSyncSubscription
src/test/
  smoke.test.jsx                  # verifica que el entorno monta React
```

### Qué cubren

**`manualPaymentInsert.test.js`** — reglas de conflicto de pagos:
- Muro libre: solo un pago por mes
- Grupo de entrenamiento: no convive con packs de escuela en el mismo mes
- Pack de escuela: no convive con grupo, no duplica el mismo horario
- Manejo de `null` / `undefined` como lista vacía

**`attendancePolicy.test.js`** — lógica de vigencia del QR y cupo de clases:
- Sin pagos → `hasQr: false`
- Pack activo → clases restantes correctas
- Pack vencido → `hasQr: false`, `currentPayment: null`
- Asistencias dentro vs. fuera del ciclo activo
- `muro_libre_mensual` → acceso ilimitado (`remainingClasses: null`)
- Renovación: el pago más reciente activo es el ciclo vigente

**`resolveManualPaymentRow.test.js`** — resolución del registro de pago:
- Precios de packs de escuela desde el catálogo
- Muro libre pase diario: tarifa estándar vs. reducida (pack8 / grupo)
- Muro libre mensual: precio según descuento
- Herencia del `pack_type` del historial del alumno
- Catálogo personalizado (precios desde `gym_settings`)

### Correr

```bash
npm run test       # modo watch (re-corre al guardar)
npm run test:run   # una sola pasada (útil para CI)
```

### Cómo agregar un test unitario

Los tests viven junto al archivo que testean (`utils/foo.test.js` al lado de `utils/foo.js`). No necesitan Supabase ni DOM — son funciones puras o con el cliente mockeado:

```js
// Mock mínimo del cliente Supabase
function makeClient(latestPackType = null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: () => ({
        maybeSingle: async () => ({ data: latestPackType ? { pack_type: latestPackType } : null, error: null }),
      }) }) }) }) }),
    }),
  }
}
```

---

## Parte 3 — Tests E2E (Playwright)

### Archivos

```
e2e/
  global.setup.js    # crea datos de prueba en Supabase local (gym, admin, alumno)
  auth.setup.js      # hace login como admin y guarda el estado del browser
  login.spec.js      # tests del formulario de login
  payments.spec.js   # tests de registro de pagos (escuela, grupo, muro)
  .auth/             # estado del browser guardado (gitignored)
  .fixtures/         # IDs de los datos de prueba (gitignored)
playwright.config.js # configuración de Playwright
```

### Cómo funciona

1. **`global.setup.js`** corre antes de todos los tests. Usa la `SUPABASE_SERVICE_ROLE_KEY` para crear via API admin:
   - Un gimnasio de prueba (`id: 00000000-...0001`)
   - Un usuario admin (`admin@test.crux`)
   - Un alumno (`student@test.crux`)
   - Guarda los IDs en `e2e/.fixtures/test-data.json`

2. **`auth.setup.js`** hace login real en el browser y guarda el `localStorage` (donde Supabase guarda el JWT) en `e2e/.auth/admin.json`. El resto de los tests arrancan pre-autenticados.

3. **El servidor de desarrollo** se arranca automáticamente con `npx vite --mode test`, que carga `.env.test.local` y conecta la app al Supabase local.

### Correr

```bash
# Supabase local debe estar corriendo primero
npx supabase start

npm run test:e2e                          # todos los tests
npm run test:e2e -- --headed              # con browser visible
npm run test:e2e -- e2e/login.spec.js     # un archivo específico
npm run test:e2e -- --debug               # modo paso a paso
```

### Aislamiento entre tests

Los tests de pagos limpian los pagos del alumno de prueba en `beforeAll` usando la service role key. Esto evita que un test contamine al siguiente (ej: registrar un pago de escuela en un test bloquea el registro de grupo en el siguiente).

```js
async function limpiarPagos(studentId) {
  const supabase = createClient(url, serviceKey, ...)
  await supabase.from('payments').delete().eq('student_id', studentId)
}
```

### Interacción con el SelectField custom

El componente `SelectField` usa un dropdown portal con `role="listbox"`. Para interactuar:

```js
// Abrir el dropdown
await page.locator('button[aria-haspopup="listbox"]', { hasText: 'Seleccionar estudiante' }).click()

// Elegir una opción (usar nombre exacto para evitar matches ambiguos)
await page.getByRole('option', { name: 'Alumno Test', exact: true }).click()
```

> **Importante:** Usar `exact: true` para evitar matchear múltiples opciones con texto similar (ej: "Escuela (Profe Multi)" vs "Escuela (Profe Gordo)").

---

## Problemas comunes

### `supabase start` dice "command not found" en bash
Scoop instala en rutas de Windows que Git Bash no ve. Usar `npx supabase` en vez de `supabase`.

### Error al `db reset`: "relation does not exist"
La migración más antigua intenta alterar una tabla que no existe todavía. Solución: generar el schema base con `npx supabase db dump -f supabase/migrations/20250101000000_initial_schema.sql` para que corra antes que las otras migraciones.

### Error al `db reset`: "policy already exists"
El dump incluye políticas RLS que las migraciones también crean. Solución: mover las migraciones que duplican políticas a `supabase/migrations/archive/`.

### `db pull` falla por historial desincronizado
```bash
npx supabase migration repair --status applied <id>
# (repetir para cada ID que liste el error)
npx supabase db pull
```

### Los tests E2E no encuentran el alumno en el dropdown
La app filtra alumnos por `gym_id`. El setup crea admin y alumno con el mismo `gym_id` (`00000000-...0001`). Si los datos de prueba se perdieron (ej: después de un `db reset`), corré:
```bash
npm run test:e2e  # global.setup.js recrea los datos automáticamente
```

### Proyecto en OneDrive
Docker puede tener problemas de permisos con carpetas sincronizadas por OneDrive. Si `supabase start` falla de forma extraña, mover el proyecto fuera de OneDrive.

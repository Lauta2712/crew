# Roadmap — De Crux Admin a producto multi-gimnasio

Documento vivo para trackear la reestructuración de este proyecto (hoy: panel a medida de Crux Escalada) hacia un producto ofrecible a cualquier gimnasio boutique (escalada, funcional, crossfit, yoga, etc.), con mejor identidad visual propia.

No confundir con:
- `PENDIENTES.md` — bugs y features del negocio actual de Crux, no relacionados con el rebranding.
- `docs/PROMPT_SISTEMA_GENERICO.md` — un prompt para regenerar un sistema equivalente **desde cero**. Este roadmap, en cambio, es el plan para **refactorizar el código existente** sin reescribirlo.

Cómo usar esto: cada fase tiene objetivo, estado actual (con evidencia concreta del código) y tareas en checklist. Vamos tachando a medida que avanzamos, y dejamos un registro de decisiones al final para no repetir discusiones.

---

## Fase 0 — Inventario de lo que ya tenemos a favor

No partimos de cero. Ya existe:

- `gyms` + `gym_id` en las tablas principales (`users`, `attendances`, `payments`) → aislamiento por tenant ya modelado en la DB.
- `gym_settings` (tabla con columna `data` JSON por `gym_id`) + `GymSettingsContext` (`src/contexts/GymSettingsContext.jsx`) + `buildCatalogFromSettingsJson` → ya hay un mecanismo de configuración por gimnasio que se fusiona con defaults. Hoy solo cubre precios/horarios, pero el patrón es extensible.
- Roles (`admin` / `coach` / `student`) genéricos, no atados a escalada.
- `ScheduleTypesEditor.jsx` y `AdminConfiguration.jsx` → ya existe UI para que un admin edite horarios, indicio de que el sistema fue pensado parcialmente para ser configurable.

Lo que falta es generalizar lo que **no** pasa por `gym_settings` todavía: vocabulario de dominio hardcodeado, identidad visual fija, y el supuesto implícito de "un solo gimnasio" (`DEFAULT_GYM_ID`) en varios flujos.

---

## Fase 1 — Generalización del dominio (prioridad 1)

**Objetivo:** que el sistema no asuma "escalada" en ningún lado — ni en datos, ni en nombres de archivos/rutas, ni en reglas de negocio.

**Estado actual (evidencia):**
- `src/constants/packs.js` tiene `CLASS_PACKS` y `SCHEDULE_TYPES` hardcodeados con nombres de Crux ("Escuela Profe Multi", "Escuelita 5 a 12 años", "Muro libre") y **reglas de negocio acopladas al nombre** (`qualifiesForMuroLibreDiscount`, `isMuroLibreMensualPackType`, `MURO_TARIFA_REDUCIDA_ETIQUETA`).
- 27 archivos en `src/` referencian "muro libre" / "escalada" — no es solo texto de UI: hay **rutas y componentes enteros** nombrados por el dominio (`/app/muro-qr`, `StudentMuroQrPage.jsx`, `CoachMuroPaymentsPage.jsx`, `FreeWallPaymentsForm.jsx`). Esto es más profundo que traducir strings.
- La tabla `attendances` usa `schedule_type_id` (genérico, bien) pero la UI y las validaciones de pago asumen la existencia de un tipo especial "muro libre" con reglas propias (pase diario vs. mensualidad, descuento combinado con Pack 8).

**Tareas:**
- [x] Modelar "tipo de actividad libre / walk-in" (hoy: muro libre) como un **flag genérico** en `SCHEDULE_TYPES`/`CLASS_PACKS` (`accessMode: 'walk_in'`, `unlimited: true`) resuelto vía `walkIn` (`DEFAULT_WALK_IN`, config por gym en `gym_settings.data.walkIn`), en vez de comparaciones `id === 'muro_libre'` repartidas por el código. Helpers genéricos en `src/constants/packs.js`: `isWalkInSchedule`, `isWalkInDailyPack`, `isDiscountEligiblePack`, `isUnlimitedPack`.
- [x] Mover `CLASS_PACKS` / `SCHEDULE_TYPES` a datos provistos por `gym_settings`: nuevo `catalogMode: 'legacy' | 'custom'` en `gymSettingsMerge.js` — Crux sigue en modo `legacy` (cero migración de datos, misma clave JSON `freeWall`), un gym nuevo puede usar modo `custom` con su propio catálogo completo desde cero.
- [x] Renombrar rutas/componentes: `/app/muro-qr` → `/app/walkin-qr`, `/app/coach/cobros-muro` → `/app/coach/cobros-libre`; `StudentMuroQrPage`→`StudentWalkInQrPage`, `CoachMuroPaymentsPage`→`CoachWalkInPaymentsPage`, `FreeWallPaymentsForm`→`WalkInPaymentsForm` (con `git mv`, historia preservada).
- [x] Auditado y resuelto: "Crux Escalada" hardcodeado reemplazado por `useGymCatalog().gymName` (páginas autenticadas, lee `gyms.name`) o `VITE_GYM_DISPLAY_NAME` (Landing/Login, sin sesión aún) — ver `src/constants/gym.js`. Logo/favicon/colores siguen fijos, es Fase 2 a propósito.
- [x] `MAIN_CLASS_PACK_IDS` / `ATTENDANCE_CYCLE_PACK_IDS` eliminados — `isAttendanceCyclePayment` ahora deriva la elegibilidad del catálogo resuelto del gym (`classPacks`), no de arrays hardcodeados con los ids de Crux.
- [x] Barrido de texto: "escalador(es)" → "alumno(s)" en todo `src/`; "muro libre" → "acceso libre" en texto de UI (las claves internas persistidas en DB — `checkin_method`, `pack_type`, `schedule_type` — no se tocaron, por la decisión de cero migración).

**Fase 1 completada (2026-08-13).** Verificación: `npm run lint` sin regresiones nuevas, `npm run test:run` 56/56 OK, `npm run build` OK. Queda pendiente (fuera de alcance a propósito, documentado como deuda menor): nombres de variables internas tipo `isMuroCheckin`/`muroDiscount` sin renombrar (cosmético, no afecta comportamiento ni queda expuesto al usuario) y el heurístico `classes_total >= 8` en `WalkInPaymentsForm.jsx` (fallback de sincronización con `subscriptions`, sigue atado al número 8 en vez de a `discountEligiblePackIds`).

**Corrección (2026-08-19): "completada" era optimista.** Al sacar el contenido hardcodeado de Crux de `StudentSchedule.jsx` (categorías fijas "Escuela de escalada"/"Grupo de entrenamiento"/"Muro libre", ya generalizado hoy) apareció que los **ids de Crux siguen manejando reglas de negocio reales**, no solo texto, en varios archivos más — esto es más profundo que la deuda "cosmética" de arriba:
- `src/pages/AdminPayments.jsx` — `GRUPO_PACK_ID`/`GRUPO_SCHEDULE_ID` hardcodeados a `'grupo_entrenamiento'`.
- `src/pages/CoachScan.jsx` — `ESCUELA_SCHEDULE_IDS` (array fijo de 3 ids) determina a qué horarios puede escanear un coach; `'grupo_entrenamiento'` tiene su propio caso especial.
- `src/utils/manualPaymentInsert.js` — regla de negocio **"grupo_entrenamiento no puede convivir en el mismo mes con packs de escuela"**, escrita comparando contra ese id literal. Esto es una regla específica del modelo de Crux (¿un gimnasio nuevo quiere exclusión mutua entre dos de sus packs? ¿cuáles? no hay forma de configurarlo hoy).
- `src/pages/StudentCalendar.jsx` — label `grupo_entrenamiento: 'Grupo'` hardcodeado.

Generalizar esto de verdad requiere decidir **qué reemplaza conceptualmente** a "grupo_entrenamiento es mutuamente excluyente con escuela" para un gimnasio cualquiera (ej. ¿un flag `exclusiveWith: [ids]` configurable por pack en `gym_settings`?) — es una decisión de producto, no un rename mecánico. Pendiente de decidir y encarar como tarea propia, separada de la generalización de contenido visible (ya resuelta).

**Decisión pendiente:** ¿generalizamos manteniendo compatibilidad con los datos actuales de Crux (migración de `gym_settings` existente), o Crux queda como "cliente legacy" con su propio config y el resto usa el sistema nuevo desde el día 1? Ver [Registro de decisiones](#registro-de-decisiones).

---

## Fase 2 — Theming / identidad visual por cliente (prioridad 2) — ✅ completada (2026-08-13)

**Objetivo:** que cada gimnasio tenga su propia paleta, tipografía y logo sin tocar código.

**Implementado:** color primario + color de acento por gimnasio (`gym_settings.data.theme`), derivación automática de las 9/7 tonalidades vía HSL (`src/utils/theme.js`), aplicadas en runtime como CSS custom properties (`--color-brand-*`, `--color-accent-*` en `:root`, `index.css`) que `tailwind.config.js` referencia — así toda clase `bg-brand-500`/`text-accent-600`/etc. ya existente en la app se re-tematiza sola, sin tocar componentes (confirmado: la gran mayoría de usos de color de marca ya pasaban por esas clases, incluidos los dos componentes compartidos más usados, `DatePicker.jsx` y `SelectField.jsx`). Tipografía elegible de una lista curada (Nunito/Inter/Poppins/Montserrat/Work Sans) vía Google Fonts. Logo por URL (`theme.logoUrl`, sin infra de upload — Supabase Storage queda pendiente). Bootstrap con env vars (`VITE_THEME_*`) para que Landing/Login se vean con la marca del deploy antes de cualquier sesión, mismo patrón que `VITE_GYM_DISPLAY_NAME` de la Fase 1. Nueva sección "Identidad visual" en `AdminConfiguration.jsx`.

**Decisiones tomadas con el usuario (acotan el alcance a propósito):**
- Config de color: un hex primario + uno de acento, no paleta completa manual.
- Logo vía campo de URL, no upload — Supabase Storage queda para más adelante.
- Grises neutros de chrome (bordes, fondos de card/sidebar) **quedan fijos para todos los gimnasios**, no se derivan del color de marca — evita casos raros y acota el trabajo. Colores semánticos fijos (leyenda de tipo de asistencia en el calendario, paleta de gráficos del dashboard) tampoco se tocan, aunque hoy coincidan por casualidad con el teal de Crux.

**Verificado:** `npm run lint`/`build`/`test:run` sin regresiones nuevas; confirmado visualmente en navegador que el look por defecto no cambió y que el mecanismo de variables CSS re-tematiza la página en vivo (probado inyectando un tema de test client-side, sin persistir nada). **Pendiente:** probar el flujo real de guardado desde Configuración con una sesión de admin real — no se ejecutó en esta sesión porque el `.env.local` local apunta al Supabase de producción de Crux y guardar hubiera cambiado el tema en vivo del gimnasio real.

**Fuera de alcance a propósito (queda para más adelante):** upload real de logo a Supabase Storage (sigue siendo URL manual), paleta neutra propia para el producto en sí (no Crux) — ver Fase 4.

**Actualización 2026-08-13 (segunda pasada):** se cerró el gap de `index.html`/`vite.config.js` que había quedado pendiente. Título de pestaña, favicon/apple-touch-icon y `theme-color` ahora se actualizan en runtime vía `applyBrandChrome()` (`src/utils/theme.js`), llamado desde `main.jsx` (bootstrap por env vars) y desde `GymSettingsContext` (refinado con el nombre/logo real del gym una vez resuelta la sesión) — el HTML estático de `index.html` queda solo como fallback visual antes de que corra ese script (flash mínimo, inevitable sin SSR). El manifest de PWA (`vite.config.js`) sí se resuelve en build time — ahora lee `VITE_GYM_DISPLAY_NAME`/`VITE_THEME_PRIMARY_COLOR`/`VITE_THEME_LOGO_URL` vía `loadEnv`, con los mismos defaults genéricos que el resto de la app. Se pobló `.env.local` (no versionado) con los valores reales de Crux para que este deploy no perdiera su marca real al generalizar los defaults. **Nota importante encontrada:** los valores hex en `.env.local` deben ir entre comillas (`VITE_THEME_PRIMARY_COLOR="#3a91a5"`) — sin comillas, Vite interpreta el `#` como inicio de comentario y la variable queda vacía. Documentado en `CLAUDE.md`.

**Riesgo a tener en cuenta:** theming en runtime vía CSS variables es mucho más simple que theming en build time (Tailwind config por tenant), pero hay que revisar que ningún componente use clases `bg-brand-500` directo sin pasar por las variables — auditar junto con la Fase 1.

---

## Fase 3 — Arquitectura multi-tenant robusta (prioridad 3)

**Objetivo:** pasar de "un gimnasio con soporte técnico para más" a "N gimnasios independientes, con aislamiento y onboarding real".

**Estado actual (evidencia):**
- `src/constants/gym.js` define `DEFAULT_GYM_ID` fijo (el UUID de Crux) y el comentario dice explícitamente "todos los nuevos estudiantes se asignan a este gimnasio" — esto es el mayor bloqueante para multi-tenant real, hay un solo gimnasio "por defecto" asumido en el alta de usuarios.
- No hay evidencia todavía revisada de políticas RLS en Supabase (pendiente de auditar) que garanticen que un admin/coach de un gym no pueda ver datos de otro.

**Tareas:**
- [x] Reemplazar el uso de `DEFAULT_GYM_ID` por selección/creación explícita de gimnasio en el flujo de alta — resuelto vía **link de invitación por gimnasio** (`/login?gym=<gym_id>`, generado y copiable desde `AdminConfiguration.jsx`): `Login.jsx` valida el `gym_id` contra `public.gyms` (política `gyms_select_public`, lectura pública de solo `id`/`name`) y lo muestra ("Te vas a registrar en «X»") antes de registrarse; `signUpWithEmail` lo pasa como `raw_user_meta_data.gym_id` y el trigger `handle_new_user` (SECURITY DEFINER) lo valida y asigna en el mismo insert — no depende de un upsert posterior con sesión, así que funciona igual con o sin confirmación por email. Sin link (`DEFAULT_GYM_ID` como fallback) sigue siendo el comportamiento histórico de un solo gimnasio. **Pendiente real:** no hay todavía onboarding de un gimnasio nuevo en sí (fila en `gyms` + `gym_settings` en modo `custom` + cuenta admin) — ver ítem de abajo.
- [x] Catálogo de packs/horarios sin contenido hardcodeado de Crux: `ClassPacksEditor.jsx` (nuevo) + `ScheduleTypesEditor.jsx` (extendido con agregar/quitar tarjetas enteras, no solo franjas) permiten armar el catálogo completo de un gimnasio desde `AdminConfiguration.jsx`, guardando siempre `catalogMode: 'custom'`. El modo `'legacy'` (`gymSettingsMerge.js`) queda sin tocar por compatibilidad, pero ya no se alcanza desde la UI — un gimnasio sin `gym_settings` configurado todavía cae ahí por default (riesgo conocido, ver nota de abajo).
- [ ] Auditar políticas RLS de Supabase en `users`, `attendances`, `payments`, `gym_settings` — confirmar filtrado estricto por `gym_id` a nivel DB, no solo en queries del frontend.
- [ ] Decidir estrategia de onboarding: ¿alta manual (ustedes crean el gimnasio) o self-serve (el cliente se registra solo)? Para vender "a demanda" en esta primera etapa, probablemente alta manual alcanza y evita construir billing/self-serve prematuramente. **Al dar de alta un gimnasio nuevo a mano, crear también su fila en `gym_settings` con `catalogMode: 'custom'` desde el día 1** — si no, ese gimnasio cae en el catálogo de Crux por default (mismo bug que se corrigió hoy para el gimnasio de prueba).
- [ ] Decidir si cada gimnasio tiene subdominio propio (`clientex.suproducto.com`) o todos comparten dominio con selección de gym en login — impacta en cómo se resuelve el theming al cargar la app (antes o después del login). El link de invitación (arriba) es una solución intermedia que ya funciona sin subdominios.
- [ ] (Más adelante, no ahora) Billing/planes si esto se vende como suscripción en vez de proyecto a medida por cliente.

---

## Fase 4 — Identidad de marca del producto

**Objetivo:** nombre, paleta y tipografía **del producto en sí** (no de Crux, no de cada cliente) — lo que ustedes usan para venderlo.

**Estado actual:** no empezado. `MARKETING.md` está redactado 100% para Crux Escalada como marca final, no como producto para revender.

**Tareas:**
- [ ] Elegir nombre de producto neutro, sin connotación de escalada (para que un dueño de crossfit o yoga no sienta que es "un sistema para gimnasios de escalada adaptado").
- [ ] Paleta y tipografía base del producto (distinta de la paleta que cada cliente configura para su propia marca vía Fase 2) — esta es la identidad de "la empresa que vende el software", no la de cada gym cliente.
- [ ] Landing propia del producto (hoy `Landing.jsx` es la landing de Crux Escalada como gimnasio, no la landing de venta del software).
- [ ] Reescribir `MARKETING.md` (o crear uno nuevo) para contenido dirigido a dueños de gimnasios en general, no a alumnos de Crux.

**Nota:** esta fase puede avanzar en paralelo a las técnicas (naming/paleta no bloquea código), pero conviene cerrarla antes de Fase 3 (onboarding de clientes reales) para no re-diseñar con un cliente ya activo.

---

## Fase 5 — Validación (no técnica, mencionar solo como recordatorio)

Antes de invertir en Fase 3 completa (multi-tenant robusto, billing, etc.), validar con 1-2 gimnasios reales usando el resultado de Fases 1+2 (dominio genérico + theming por cliente, onboarding manual). Evita construir infraestructura para una demanda que todavía no está confirmada.

---

## Registro de decisiones

_(vamos completando acá cada vez que se resuelva un "pendiente" de arriba, con fecha)_

- **2026-08-13** — Se define el orden de prioridades: (1) generalizar dominio, (2) theming por cliente, (3) multi-tenancy robusto, (4) identidad de marca del producto. Alta manual de clientes se asume suficiente para la primera etapa (no self-serve).

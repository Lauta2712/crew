# Configuración externa

Guía de todo lo que hay que configurar **fuera del código** (paneles de Supabase, Mercado
Pago, Vercel) para levantar un deploy de Crew de cero o para diagnosticar por qué algo no
anda cuando el código está bien pero la integración externa no. No duplica lo que ya está en
`CLAUDE.md` (variables `VITE_*`, arquitectura, roles) — para eso ver ese archivo.

## 1. Supabase

Proyecto actual: **"CREW"**, ref `ndvuieliyjnfcmqonchs` (`https://ndvuieliyjnfcmqonchs.supabase.co`).

### 1.1 Datos para el frontend (`.env.local`)

`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se sacan de **Project Settings → API** en el
dashboard de Supabase (`https://supabase.com/dashboard/project/<ref>/settings/api`). La anon
key es pública (`sb_publishable_...`), pero igual no se commitea — vive solo en `.env.local`
(local) y en las variables de entorno del deploy de Vercel (producción, ver sección 3).

### 1.2 Secrets de Edge Functions

Se configuran en **Project Settings → Edge Functions → Secrets**
(`https://supabase.com/dashboard/project/<ref>/settings/functions`), o por CLI:
`supabase secrets set NOMBRE=valor --project-ref <ref>`. **Nunca** en `.env.local` — esos
valores no deben llegar al bundle del frontend.

| Secret | Para qué función | Notas |
|---|---|---|
| `MP_ACCESS_TOKEN` | `create-crew-checkout`, `crew-subscription-webhook` | Token de Mercado Pago. Sandbox: `TEST-...` (Credenciales de prueba). Producción: `APP_USR-...` (Credenciales de producción). Ver sección 2.4. |
| `CREW_SITE_URL` | `create-crew-checkout` | Dominio público de Crew, sin barra final (el código ya la recorta si la lleva, pero mejor cargarlo limpio). Se usa para el `back_url` post-pago. |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente en cada
Edge Function — no hace falta configurarlos a mano.

Sin `MP_ACCESS_TOKEN` cargado, `create-crew-checkout` responde `501` con un mensaje claro en
vez de romper (pensado para poder deployar el resto de la app antes de tener las
credenciales de Mercado Pago listas).

### 1.3 `verify_jwt` por función

Definido en `supabase/config.toml` (`[functions.<slug>] verify_jwt = ...`) y debe coincidir
con lo desplegado (se ve con `list_edge_functions`/dashboard). Las dos funciones de Crew
Pricing son `verify_jwt = false` porque se llaman sin sesión de usuario (Landing pública /
webhook de Mercado Pago):

- `create-crew-checkout` → `verify_jwt = false`
- `crew-subscription-webhook` → `verify_jwt = false`

### 1.4 Diagnosticar una Edge Function

Vía MCP de Supabase (`query_logs`) o dashboard → **Edge Functions → [función] → Logs**.
Útil para confirmar si una función fue invocada y con qué status, sin depender del panel de
Mercado Pago (que en sandbox puede no reflejar todo).

## 2. Mercado Pago (suscripción de Crew — cobro a dueños de gimnasio)

Panel de developers: **https://www.mercadopago.com.ar/developers/panel/app** — si no hay
una aplicación creada todavía, hay que crear una primero (nombre libre, tipo "Pagos
online"/CheckoutAPI).

### 2.1 Cuentas de prueba (sandbox)

**Developers → [tu app] → Cuentas de prueba.** Ahí se crean cuentas ficticias "Comprador"
(Buyer) y "Vendedor" (Seller), cada una con su `User ID`, `Username` y contraseña generados
automáticamente.

- El **email** de cada cuenta de prueba (necesario como `payer_email` al crear un
  `preapproval`) tiene el formato `test_user_XXXXXXXXXX@testuser.com`, donde
  `XXXXXXXXXX` suele coincidir con el sufijo numérico del `Username`
  (`TESTUSER8033690244718075432` → `test_user_8033690244718075432@testuser.com`).
- **Ojo:** revisar los emails de Buyer y Seller en la misma sesión del navegador puede
  mezclarlos (Mercado Pago comparte sesión de Developers entre pestañas). Si hace falta
  confirmar el email de una cuenta específica, usar una ventana de incógnito nueva por
  cuenta, cerrándola del todo antes de abrir la siguiente.
- Mercado Pago en sandbox **rechaza** `payer_email` que no sea el de una cuenta de prueba
  real (ej. `test@example.com` da 500 genérico al crear el `preapproval`) — no es un bug de
  Crew, es una restricción del sandbox. En producción, con emails reales de usuarios, esto
  no aplica.

### 2.2 Tarjetas de prueba

Para completar un pago de prueba (Argentina):

| Campo | Valor |
|---|---|
| Número (Mastercard) | `5031 7557 3453 0604` |
| Vencimiento | `11/30` |
| CVV | `123` |
| Titular | `APRO` (simula pago **aprobado** — otros valores simulan rechazo/pendiente) |
| DNI | cualquier DNI válido, ej. `12345678` |

Al completar el checkout hay que estar logueado en el navegador **como la cuenta de prueba
Buyer**, no con la cuenta real de Mercado Pago — si el checkout te ofrece autocompletar con
una tarjeta guardada real, es señal de que la sesión no es la del Buyer test user. El
badge **"Test"** arriba a la derecha del checkout confirma que estás en sandbox.

### 2.3 Webhooks

**Developers → [tu app] → Notificaciones → Webhooks** — hace falta configurarlo ahí además
de mandar `notification_url` en el request de `create-crew-checkout`; si no está configurado
a nivel de aplicación, Mercado Pago no manda notificaciones aunque el `preapproval` las pida.

1. **Configurar notificaciones** → cargar la URL (misma para producción y prueba):
   `https://<ref>.supabase.co/functions/v1/crew-subscription-webhook`
2. En "Otros eventos", marcar **"Planes y suscripciones"** (topic `subscription_preapproval`
   / `preapproval`). No hace falta ningún otro evento para este flujo.
3. Guardar — genera una clave secreta para la app (no se usa todavía para validar firma en
   el código, pero conviene guardarla para cuando se agregue esa verificación).
4. El botón **"Simular notificación"** manda un evento de prueba con un `id` ficticio — sirve
   para confirmar que la URL responde `200`, pero no actualiza nada real (el `preapproval_id`
   no existe).
5. El **panel de monitoreo** (`Webhooks → Panel de monitoreo`) filtra por Ambiente
   (Productivo/Prueba) — poco confiable en sandbox: puede no mostrar ni el evento simulado.
   No usarlo como única fuente de verdad; confirmar directo en los logs de la Edge Function
   (sección 1.4) o consultando la fila en `crew_subscriptions`.
6. **Entrega automática en sandbox:** no siempre se pudo confirmar que Mercado Pago mande la
   notificación real sola tras un pago de prueba (puede haber demoras largas o no llegar).
   Esto es una limitación conocida del ambiente de test, no necesariamente indica un problema
   real — para confirmar la entrega automática hace falta probarlo en producción con un pago
   real. Si hace falta forzar la actualización manualmente durante testing, se puede invocar
   el webhook a mano:
   ```
   curl -X POST "https://<ref>.supabase.co/functions/v1/crew-subscription-webhook?data.id=<preapproval_id>&type=subscription_preapproval"
   ```
   (la función siempre vuelve a consultar el estado real a la API de Mercado Pago con ese id,
   nunca confía en el body de la notificación).

### 2.4 Pasar a producción

1. **Developers → [tu app] → Credenciales de producción** → copiar el `Access Token`
   (`APP_USR-...`).
2. Reemplazar el secret `MP_ACCESS_TOKEN` en Supabase (sección 1.2) por ese valor.
3. Repetir la configuración de webhooks (sección 2.3) para el ambiente de producción si
   Mercado Pago la pide por separado — confirmar con un pago real chico que la notificación
   automática llega y `crew_subscriptions.status` pasa a `authorized` solo, sin invocación
   manual.

## 3. Vercel (deploy)

Las variables `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_GYM_DISPLAY_NAME`, `VITE_THEME_*`, ver `CLAUDE.md`) hay que cargarlas también en
**Vercel → Project Settings → Environment Variables** — `.env.local` no se commitea ni se
sube solo. Los secrets de Mercado Pago (`MP_ACCESS_TOKEN`, `CREW_SITE_URL`) **no** van acá:
esos son secrets de Edge Functions y viven solo en Supabase (sección 1.2).

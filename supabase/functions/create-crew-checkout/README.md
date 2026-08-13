# create-crew-checkout

Edge Function pública (sin sesión de usuario — quien la llama todavía no tiene cuenta)
que arranca una suscripción de Crew (el producto) vía Mercado Pago:
- resuelve el precio en USD del lado del servidor (nunca confía en el precio del cliente)
- convierte a ARS con la cotización oficial del día (dolarapi.com)
- inserta una fila `pending` en `crew_subscriptions`
- crea el `preapproval` en Mercado Pago y devuelve el `init_point` para redirigir al pagador

Si `MP_ACCESS_TOKEN` no está configurado, responde `501` con un mensaje claro en vez de
romper — así se puede dejar desplegado antes de tener las credenciales reales.

## Body esperado
```json
{
  "contact_name": "string",
  "contact_email": "string",
  "gym_name": "string opcional",
  "plan_id": "basico|pro",
  "billing_period": "monthly|annual"
}
```

## Retorno
`{ init_point: "https://..." }` — el frontend redirige el navegador ahí.

## Variables de entorno (secrets de la función, no `VITE_*`)
- `MP_ACCESS_TOKEN` — access token de Mercado Pago (nunca en el frontend).
- `CREW_SITE_URL` — dominio público para el `back_url` post-pago (ej. `https://crew.app`).

## Alta manual pendiente
Esta función no crea el gimnasio ni la cuenta admin — solo cobra. Cuando
`crew-subscription-webhook` marca una fila como `authorized`, el alta del gimnasio real
sigue siendo manual (decisión ya tomada en `docs/ROADMAP_WHITELABEL.md`, Fase 3).

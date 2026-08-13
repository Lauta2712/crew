# crew-subscription-webhook

Edge Function pública que recibe las notificaciones (`webhook`/`IPN`) de Mercado Pago para
las suscripciones creadas por `create-crew-checkout`. Nunca confía en el body de la
notificación: siempre vuelve a pedirle el estado real a la API de Mercado Pago con el id
recibido, y recién ahí actualiza `crew_subscriptions.status`.

Siempre responde `200` (aunque no pueda procesar la notificación) para evitar que Mercado
Pago reintente en loop una notificación que nunca vamos a poder resolver.

## Configuración en Mercado Pago
URL del webhook a configurar en el panel de Mercado Pago (o vía `notification_url` al crear
el `preapproval`): `https://<tu-proyecto>.supabase.co/functions/v1/crew-subscription-webhook`

## Variables de entorno (secrets de la función)
- `MP_ACCESS_TOKEN` — mismo access token que `create-crew-checkout`.

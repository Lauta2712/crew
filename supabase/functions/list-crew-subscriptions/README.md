# list-crew-subscriptions

Lista las suscripciones al producto Crew (`crew_subscriptions` — cobro a dueños de
gimnasio vía Mercado Pago, ver `create-crew-checkout`/`crew-subscription-webhook`), para
que el superadmin sepa quién pagó y todavía no tiene su gimnasio dado de alta.

- valida que el caller sea `superadmin` (según `public.users.role`)
- `crew_subscriptions` no tiene ninguna policy RLS para `authenticated`/`anon` a propósito
  (solo `service_role` la lee/escribe — ver `schema_completo.sql`), así que esta función
  es la única forma de mostrar esos datos en el frontend
- de solo lectura: no crea, actualiza ni borra nada

## Body esperado
Sin body — solo requiere el JWT del superadmin en el header `Authorization`.

## Respuesta
```json
{
  "success": true,
  "subscriptions": [
    {
      "id": "uuid",
      "contact_name": "string",
      "contact_email": "string",
      "gym_name": "string | null",
      "plan_id": "basico | pro",
      "billing_period": "monthly | annual",
      "status": "pending | authorized | paused | cancelled",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

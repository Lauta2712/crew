# register-payment

Edge Function que registra un pago desde admin de forma consistente:
- valida que el caller sea `admin`
- evita duplicados: 1 pago por estudiante por mes
- inserta en `payments`
- crea/actualiza `subscriptions` para que el plan refleje el pack

## Body esperado
```json
{
  "student_id": "uuid",
  "pack_type": "single|pack4|pack8|grupo_entrenamiento",
  "schedule_type": "string",
  "paid_at": "ISO string"
}
```

## Retorno
`{ success: true, payment, subscription_id }` en caso de éxito.


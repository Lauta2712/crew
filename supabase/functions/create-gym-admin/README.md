# create-gym-admin

Alta de un gimnasio nuevo (tenant) + su primera cuenta admin:
- valida que el caller sea `superadmin` (según `public.users.role`)
- crea la fila en `gyms`
- crea `gym_settings` con `catalogMode: 'custom'` y catálogo vacío (`classPacks: []`,
  `scheduleTypes: []`) — evita que el gimnasio nuevo herede el catálogo hardcodeado de Crux
- crea el usuario en `Auth` con la contraseña que mandó el superadmin, o una generada
  en el servidor si no mandó ninguna
- crea/actualiza la fila del admin en `public.users` con `role: 'admin'` y el `gym_id` nuevo

Si un paso falla, hace rollback de lo ya creado (orden inverso).

No acepta un `gym_id` existente — solo crea tenants nuevos, nunca escribe sobre un gimnasio
ya existente.

## Body esperado
```json
{
  "gym_name": "string",
  "admin_name": "string",
  "admin_email": "string",
  "admin_password": "string (opcional, mínimo 6 caracteres — si no se manda, se genera una)"
}
```

## Respuesta
```json
{
  "success": true,
  "gym_id": "uuid",
  "gym_name": "string",
  "admin_id": "uuid",
  "admin_email": "string",
  "temp_password": "string"
}
```

`temp_password` solo se devuelve una vez — no queda guardada en ningún lado, hay que
copiarla y pasársela al dueño del gimnasio por fuera de la app.

# login-as-gym-admin

"Modo soporte": permite a un `superadmin` iniciar sesión como el admin de un gimnasio
existente, sin conocer su contraseña — para testear/soportar gimnasios clientes.

- valida que el caller sea `superadmin` (según `public.users.role`)
- busca el admin más antiguo activo (`role: 'admin'`, `blocked: false`, `deleted_at is null`)
  del gimnasio pedido
- genera un magic-link token vía `auth.admin.generateLink` (no crea ni cambia contraseñas)
- devuelve el `hashed_token` para que el frontend lo canjee con
  `supabase.auth.verifyOtp({ email, token, type: 'magiclink' })`

No escribe nada — es de solo lectura + generación de token. El cambio de sesión pasa
enteramente en el cliente.

## Body esperado
```json
{ "gym_id": "uuid" }
```

## Respuesta
```json
{ "success": true, "email": "string", "admin_name": "string", "hashed_token": "string" }
```

Si el gimnasio no tiene un admin activo, responde `404`.

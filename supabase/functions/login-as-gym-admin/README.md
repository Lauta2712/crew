# login-as-gym-admin

"Modo soporte": permite a un `superadmin` iniciar sesión como el admin de un gimnasio
existente, sin conocer su contraseña — para testear/soportar gimnasios clientes.

- valida que el caller sea `superadmin` (según `public.users.role`)
- busca el admin más antiguo activo (`role: 'admin'`, `blocked: false`, `deleted_at is null`)
  del gimnasio pedido
- **si no encuentra ninguno, autoprovisiona uno** en vez de bloquear al superadmin con un
  error que exige una query manual: crea un auth user + fila en `public.users` (`role:
  'admin'`, `gym_id` del gimnasio) con email `<local-del-superadmin>+support-<gymId
  corto>@<dominio-del-superadmin>` y nombre `Soporte — <nombre del gimnasio>`. No hace
  falta que ese email reciba correo real — el login nunca envía un mail, se resuelve
  enteramente con el `hashed_token` devuelto abajo. Justificación: un superadmin ya
  demostró tener ese rol en el paso anterior, así que no tiene sentido frenarlo por un
  gimnasio dado de alta sin cuenta admin (no debería pasar si los gimnasios se crean
  desde `create-gym-admin`, pero puede pasar con altas manuales por SQL).
- genera un magic-link token vía `auth.admin.generateLink` (no crea ni cambia contraseñas
  de la cuenta admin real preexistente, si la hay)
- devuelve el `hashed_token` para que el frontend lo canjee con
  `supabase.auth.verifyOtp({ token_hash: hashed_token, type: 'magiclink' })` — **no**
  con el parámetro `token` (ese espera el código OTP de 6 dígitos, no el hash de un
  link; usarlo ahí produce el error engañoso "Token has expired or is invalid" /
  `otp_expired` de GoTrue aunque el token sea válido y recién generado)

El cambio de sesión pasa enteramente en el cliente. Es idempotente por gimnasio: la
segunda vez que se entra a un gimnasio sin admin, el email `+support-<gymId>` ya existe
y se reutiliza esa misma cuenta en vez de crear otra.

## Body esperado
```json
{ "gym_id": "uuid" }
```

## Respuesta
```json
{ "success": true, "email": "string", "admin_name": "string", "hashed_token": "string" }
```

Solo responde `404` si, además de no haber admin, el email del superadmin caller no
tiene formato válido (`local@dominio`) — caso que en la práctica no debería darse porque
ya pasó por `auth.getUser`.

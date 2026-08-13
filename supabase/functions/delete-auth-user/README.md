# delete-auth-user (legacy)

> **Reemplazada por `delete-student`:** el admin ahora solo invoca `delete-student`, que borra tablas relacionadas, `public.users` y el usuario en Auth en un solo flujo. Podés mantener esta función desplegada solo si tenés otro cliente que la use; no es necesaria para la app admin actual.

Función Edge que borra un usuario de **Auth** (`auth.users`). Útil como utilidad aislada si ya eliminaste la fila en `public.users` y solo necesitás liberar el correo.

## Desplegar

```bash
supabase functions deploy delete-auth-user
```

Usa `SUPABASE_SERVICE_ROLE_KEY`. Solo usuarios con `role = 'admin'` en `public.users` pueden llamarla.

## Alternativa recomendada

```bash
supabase functions deploy delete-student
```

Ver `../delete-student/README.md` (si existe) o el código en `delete-student/index.ts`.

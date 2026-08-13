# Checklist — Cambio de contraseña de la DB en Supabase

Contexto: se cambió sin querer la contraseña de la base de datos de Supabase (proyecto `jzvxmtlvrhlogfpbuvqg`). Esta contraseña afecta solo la **conexión directa a Postgres**, no las API keys (`anon`/`service_role`) que usa la app, así que el frontend y las Edge Functions no deberían verse afectados. Pendiente de revisar:

## Por hacer

- [ ] Guardar la nueva contraseña en un gestor de contraseñas (1Password, Bitwarden, etc.)
- [ ] Confirmar que el login y las páginas principales de la app siguen funcionando (admin, coach, student)
- [ ] Probar al menos una Edge Function (ej. `create-coach-user` o `register-payment`)
- [ ] Revisar si hay conexión directa a Postgres vía Supabase CLI local (`supabase link` / `supabase db push`) — ¿usa connection string con password o token?
- [ ] Revisar herramientas externas conectadas por connection string directa (no por API):
  - [ ] pgAdmin / DBeaver / TablePlus / psql
  - [ ] Metabase / Retool / n8n / Zapier u otra automatización/BI
  - [ ] Scripts de backup o seed guardados localmente
- [ ] Si algo de lo anterior usaba la password vieja, actualizarlo con la nueva

## Notas

- `VITE_SUPABASE_ANON_KEY` (`.env.local`) y las keys `service_role` de las Edge Functions **no cambian** con la password de la DB.
- No se encontraron referencias directas a la password de la DB en el repo (`crux-admin`) al momento de este chequeo.

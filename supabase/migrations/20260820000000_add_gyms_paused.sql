-- Permite a un superadmin pausar/reactivar un gimnasio (ej: se atrasó con la
-- suscripción a Crew) sin borrar sus datos. Mismo patrón nullable-timestamp que
-- "users.deleted_at": paused_at NULL = activo, con fecha = pausado desde cuándo.
-- Un gimnasio pausado bloquea el login de sus admin/coach/student (ver useAuth.jsx),
-- igual que ya hace "users.blocked" a nivel de un usuario individual.
ALTER TABLE "public"."gyms"
  ADD COLUMN IF NOT EXISTS "paused_at" timestamptz;

-- Solo superadmin puede pausar/reactivar — mismo helper SECURITY DEFINER que ya
-- usan las policies de solo-lectura cross-gym (evita recursión de RLS sobre users).
CREATE POLICY "gyms_update_superadmin" ON "public"."gyms"
FOR UPDATE TO "authenticated"
USING (public.current_user_role() = 'superadmin')
WITH CHECK (public.current_user_role() = 'superadmin');

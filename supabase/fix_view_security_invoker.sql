-- Corrige el hallazgo ERROR del advisor de seguridad de Supabase: la vista
-- student_remaining_classes corría como SECURITY DEFINER (permisos de quien
-- la creó, no de quien consulta), bypaseando el RLS de users/subscriptions/
-- attendances. security_invoker = true hace que respete el RLS del usuario
-- que la consulta, como cualquier tabla normal.
ALTER VIEW "public"."student_remaining_classes" SET (security_invoker = true);

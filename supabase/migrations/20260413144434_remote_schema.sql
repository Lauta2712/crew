drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (id, gym_id, name, email, role, phone)
  values (
    new.id,                         -- mismo uuid que auth.users
    null,                           -- gym por defecto (puedes cambiarlo)
    coalesce(new.raw_user_meta_data->>'name', ''), -- si lo usas
    new.email,
    'student',                      -- rol por defecto
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



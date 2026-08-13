-- Bloquear/suspender y eliminar (soft) alumnos desde admin

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT null;

COMMENT ON COLUMN public.users.blocked IS 'Si true, el usuario no puede iniciar sesión (cuenta suspendida)';
COMMENT ON COLUMN public.users.deleted_at IS 'Si no es null, el usuario está dado de baja y no se lista en admin';

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_blocked ON public.users(blocked) WHERE blocked = false;

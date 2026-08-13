-- Precios y horarios editables por administradores (se fusionan con valores por defecto en código).
CREATE TABLE IF NOT EXISTS public.gym_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gym_settings_gym_id ON public.gym_settings (gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_settings_updated_at ON public.gym_settings (updated_at DESC);

COMMENT ON TABLE public.gym_settings IS 'Overrides de precios (packs, muro) y textos de horarios por gimnasio; gym_id NULL = fila global.';

ALTER TABLE public.gym_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE POLICY gym_settings_select_scoped
  ON public.gym_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin')
    OR gym_id IS NULL
    OR gym_id = (SELECT u2.gym_id FROM public.users u2 WHERE u2.id = (SELECT auth.uid()))
  );

CREATE OR REPLACE POLICY gym_settings_insert_admin
  ON public.gym_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

CREATE OR REPLACE POLICY gym_settings_update_admin
  ON public.gym_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

CREATE OR REPLACE POLICY gym_settings_delete_admin
  ON public.gym_settings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

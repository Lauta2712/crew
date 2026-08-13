-- Los admins pueden leer todas las asignaciones (pantalla Profesores: editar horario).

CREATE OR REPLACE POLICY coach_assignments_select_admin
  ON public.coach_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

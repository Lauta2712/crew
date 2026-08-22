-- Cierra el hueco de aislamiento multi-tenant: las policies RLS trataban
-- "gym_id IS NULL" (del admin/coach que consulta, o de la fila consultada)
-- como comodín "visible para todos los gimnasios". Con un solo gimnasio real
-- (Crux) esto era inofensivo; con gimnasios clientes reales es una fuga de
-- datos entre tenants. Verificado antes de aplicar en prod (2026-08-21): 0
-- filas en attendances/payments/subscriptions/gym_settings/plans/courses con
-- gym_id NULL en ese momento, así que no hizo falta backfill.
--
-- Además: gym_settings_select_scoped tenía una rama sin ningún scoping por
-- gym ("cualquier admin, de cualquier gimnasio, puede leer") — se corrige
-- acá también, ya que es el mismo problema de fondo.
--
-- Complementa (misma corrección, lado frontend): se sacó el `.or('gym_id.eq.X,
-- gym_id.is.null')` de las queries de alumnos en Students.jsx, AdminPayments.jsx,
-- AdminScan.jsx, CheckinManual.jsx, Coaches.jsx, AdminConfiguration.jsx,
-- Dashboard.jsx, WalkInPaymentsForm.jsx, coachScopeStudents.js — y el
-- auto-migrado silencioso de alumnos con gym_id null a DEFAULT_GYM_ID
-- (Crux) en useAuth.jsx, que hubiera vuelto a mezclar alumnos de un
-- gimnasio nuevo con los de Crux por la puerta de atrás.

ALTER POLICY "gym_settings_select_scoped" ON "public"."gym_settings"
USING (
  gym_id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
);

ALTER POLICY "attendances_admin_scoped_all" ON "public"."attendances"
USING (EXISTS (
  SELECT 1 FROM public.users me
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND attendances.gym_id = me.gym_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND attendances.gym_id = me.gym_id
));

ALTER POLICY "attendances_select_coach_scoped" ON "public"."attendances"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = attendances.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "attendances_insert_coach_scoped" ON "public"."attendances"
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = attendances.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "payments_insert_admin_scoped" ON "public"."payments"
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "payments_select_admin_scoped" ON "public"."payments"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "payments_select_coach_scoped" ON "public"."payments"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "payments_insert_coach_scoped" ON "public"."payments"
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "subscriptions_admin_scoped_all" ON "public"."subscriptions"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = subscriptions.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND st.gym_id = me.gym_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = subscriptions.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "subscriptions_select_coach_scoped" ON "public"."subscriptions"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = subscriptions.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND st.gym_id = me.gym_id
));

ALTER POLICY "users_select_admin_scoped" ON "public"."users"
USING (
  public.current_user_role() = 'admin'
  AND users.gym_id = public.current_user_gym_id()
);

ALTER POLICY "users_update_admin_scoped" ON "public"."users"
USING (
  public.current_user_role() = 'admin'
  AND users.gym_id = public.current_user_gym_id()
)
WITH CHECK (
  public.current_user_role() = 'admin'
  AND users.gym_id = public.current_user_gym_id()
);

ALTER POLICY "users_select_coach_scoped" ON "public"."users"
USING (
  users.role = 'student'
  AND public.current_user_role() = 'coach'
  AND users.gym_id = public.current_user_gym_id()
);

ALTER POLICY "gyms_select_own" ON "public"."gyms"
USING (
  id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
);

ALTER POLICY "plans_select_scoped" ON "public"."plans"
USING (
  gym_id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
);

ALTER POLICY "courses_select_scoped" ON "public"."courses"
USING (
  gym_id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
);

ALTER POLICY "student_projects_select_admin_scoped" ON "public"."student_projects"
USING (
  EXISTS (
    SELECT 1 FROM public.users me
    LEFT JOIN public.users st ON st.id = student_projects.student_id
    WHERE me.id = auth.uid() AND me.role = 'admin'
      AND st.gym_id = me.gym_id
  )
);

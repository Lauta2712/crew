-- Coaches need to SELECT payments and subscriptions to detect pack8 discounts
-- when registering muro payments. Without these policies, discount detection
-- silently returns empty data and every student is shown the full price.

-- Allow coaches to SELECT payments for students in their gym.
CREATE POLICY "payments_select_coach_scoped" ON "public"."payments"
FOR SELECT TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM public.users me
    LEFT JOIN public.users st ON st.id = payments.student_id
    WHERE me.id = auth.uid()
      AND me.role = 'coach'
      AND (
        payments.student_id IS NULL  -- visitor (pase diario sin cuenta)
        OR me.gym_id IS NULL
        OR st.gym_id IS NULL
        OR st.gym_id = me.gym_id
      )
  )
);

-- Allow coaches to INSERT payments for students in their gym
-- (visitor payments have student_id IS NULL — allowed unconditionally for coaches).
CREATE POLICY "payments_insert_coach_scoped" ON "public"."payments"
FOR INSERT TO "authenticated"
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users me
    LEFT JOIN public.users st ON st.id = payments.student_id
    WHERE me.id = auth.uid()
      AND me.role = 'coach'
      AND (
        payments.student_id IS NULL
        OR me.gym_id IS NULL
        OR st.gym_id IS NULL
        OR st.gym_id = me.gym_id
      )
  )
);

-- Allow coaches to SELECT subscriptions for students in their gym,
-- so classes_total can be used to detect pack8 / grupo_entrenamiento discount.
CREATE POLICY "subscriptions_select_coach_scoped" ON "public"."subscriptions"
FOR SELECT TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM public.users me
    LEFT JOIN public.users st ON st.id = subscriptions.student_id
    WHERE me.id = auth.uid()
      AND me.role = 'coach'
      AND (
        me.gym_id IS NULL
        OR st.gym_id IS NULL
        OR st.gym_id = me.gym_id
      )
  )
);

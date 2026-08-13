-- Coaches need to SELECT and INSERT attendances to register student check-ins
-- from the coach scan page (/app/coach/scan). Without these policies, the insert
-- fails with 403 (row-level security violation) and the SELECT returns empty,
-- preventing coaches from seeing recent attendance data for their students.

-- Allow coaches to SELECT attendances for students in their gym.
CREATE POLICY "attendances_select_coach_scoped" ON "public"."attendances"
FOR SELECT TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM public.users me
    LEFT JOIN public.users st ON st.id = attendances.student_id
    WHERE me.id = auth.uid()
      AND me.role = 'coach'
      AND (
        me.gym_id IS NULL
        OR st.gym_id IS NULL
        OR st.gym_id = me.gym_id
      )
  )
);

-- Allow coaches to INSERT attendances for students in their gym.
CREATE POLICY "attendances_insert_coach_scoped" ON "public"."attendances"
FOR INSERT TO "authenticated"
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users me
    LEFT JOIN public.users st ON st.id = attendances.student_id
    WHERE me.id = auth.uid()
      AND me.role = 'coach'
      AND (
        me.gym_id IS NULL
        OR st.gym_id IS NULL
        OR st.gym_id = me.gym_id
      )
  )
);

-- Tabla de asignación horario ↔ profesor (coach).
-- Usada por la Edge Function create-coach-user / coach_assignments y por CoachDashboard.

CREATE TABLE IF NOT EXISTS public.coach_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  schedule_type_id text NOT NULL,
  gym_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_assignments_coach_schedule_unique UNIQUE (coach_id, schedule_type_id)
);

COMMENT ON TABLE public.coach_assignments IS 'Horarios que cada profesor puede gestionar (IDs alineados a SCHEDULE_TYPES en la app)';
COMMENT ON COLUMN public.coach_assignments.schedule_type_id IS 'Ej.: muro_libre, escuela_multi, escuela_gordo, escuelita';
COMMENT ON COLUMN public.coach_assignments.gym_id IS 'Gimnasio del alcance del profe (nullable si aplica a todos)';

CREATE INDEX IF NOT EXISTS idx_coach_assignments_coach_id
  ON public.coach_assignments (coach_id);

ALTER TABLE public.coach_assignments ENABLE ROW LEVEL SECURITY;

-- El profe ve solo sus filas (panel / cliente con JWT).
CREATE OR REPLACE POLICY coach_assignments_select_own
  ON public.coach_assignments
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

-- Escritura: solo service_role (Edge Functions con SUPABASE_SERVICE_ROLE_KEY), no desde el browser.

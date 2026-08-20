-- =====================================================================
-- Crew — script de creación completa de la base de datos
-- Reconstruye el esquema actual reuniendo initial_schema.sql + todas las
-- migraciones posteriores (incluida supabase/migrations/archive/, que
-- quedó fuera del dump inicial pero sigue viva en producción — ej.
-- gym_settings). Pensado para correr una sola vez sobre un proyecto
-- Supabase nuevo (requiere auth.users, auth.uid() y extensiones propias
-- de Supabase, no es Postgres genérico).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensiones (ya vienen instaladas en cualquier proyecto Supabase
-- nuevo; se declaran igual por completitud/documentación).
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ---------------------------------------------------------------------
-- Función + trigger: crea la fila en public.users cuando alguien se
-- registra vía Supabase Auth (rol 'student' por defecto).
--
-- gym_id sale de raw_user_meta_data->>'gym_id' (pasado por signUpWithEmail
-- vía options.data, ver src/hooks/useAuth.jsx) — resuelve el link de
-- invitación por gimnasio (/login?gym=<id>, Crew es multi-tenant: N
-- gimnasios comparten este proyecto). Se valida contra public.gyms acá
-- mismo (no confiar en el cliente) y cae a null si no vino o no existe;
-- corre en el trigger (no en un upsert posterior desde el cliente) para
-- no depender de que haya sesión activa — si el proyecto requiere
-- confirmación por email, un upsert posterior correría sin auth.uid() y
-- RLS lo bloquearía.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  requested_gym_id uuid;
  resolved_gym_id uuid;
begin
  begin
    requested_gym_id := (new.raw_user_meta_data->>'gym_id')::uuid;
  exception when others then
    requested_gym_id := null;
  end;

  if requested_gym_id is not null and exists (select 1 from public.gyms where id = requested_gym_id) then
    resolved_gym_id := requested_gym_id;
  else
    resolved_gym_id := null;
  end if;

  insert into public.users (id, gym_id, name, email, role, phone)
  values (
    new.id,
    resolved_gym_id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    'student',
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."gyms" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "gym_id" uuid,
    "name" text NOT NULL,
    "email" text,
    "phone" text,
    "role" text,
    "created_at" timestamp without time zone DEFAULT now(),
    "blocked" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);

-- Precios y horarios editables por admin; se fusionan con defaults en código.
-- gym_id NULL = fila global (fallback). Sin FK a gyms a propósito (ver original).
CREATE TABLE IF NOT EXISTS "public"."gym_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "gym_id" uuid,
    "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "gym_id" uuid,
    "name" text,
    "classes_per_month" integer,
    "price" numeric,
    "created_at" timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid,
    "plan_id" uuid,
    "start_date" date,
    "end_date" date,
    "classes_total" integer,
    "created_at" timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "subscription_id" uuid,
    "amount" numeric,
    "payment_method" text,
    "paid_at" timestamp without time zone DEFAULT now(),
    "student_id" uuid,          -- NULL = visitante (pase diario sin cuenta)
    "pack_type" text,           -- single, pack4, pack8
    "schedule_type" text,       -- muro_libre, escuela_multi, etc.
    "schedule_slot" text        -- "<days>|<time>"; NULL = cualquier franja
);

CREATE TABLE IF NOT EXISTS "public"."attendances" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid,
    "gym_id" uuid,
    "attended_at" timestamp without time zone DEFAULT now(),
    "checkin_method" text,
    "schedule_type_id" text
    -- Nota: sin índice único por (student_id, día) — se removió a propósito;
    -- un alumno puede tener más de una asistencia por día (clase + muro libre).
);

CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "gym_id" uuid,
    "name" text NOT NULL,
    "description" text,
    "level" text,
    "start_date" date,
    "created_at" timestamp with time zone DEFAULT now()
);

-- Horarios que cada profe puede gestionar (IDs alineados a SCHEDULE_TYPES en la app).
CREATE TABLE IF NOT EXISTS "public"."coach_assignments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "coach_id" uuid NOT NULL,
    "schedule_type_id" text NOT NULL,  -- ej: muro_libre, escuela_multi, escuela_gordo, escuelita
    "gym_id" uuid,                     -- alcance del profe; NULL = todos los gyms
    "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Legacy: no está referenciada en el código actual del front (sí existe en la
-- base real). Se incluye para que el script sea 100% fiel al esquema vivo.
CREATE TABLE IF NOT EXISTS "public"."checkin_sessions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "gym_id" uuid NOT NULL,
    "token" uuid NOT NULL,
    "expires_at" timestamp without time zone NOT NULL,
    "used" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."student_projects" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamptz DEFAULT now()
);

-- Suscripción de un dueño de gimnasio AL PRODUCTO Crew (cobro vía Mercado Pago).
-- No confundir con "subscriptions" (alumno -> plan de SU gimnasio).
CREATE TABLE IF NOT EXISTS "public"."crew_subscriptions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "contact_name" text NOT NULL,
    "contact_email" text NOT NULL,
    "gym_name" text,
    "plan_id" text NOT NULL,
    "billing_period" text NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "mp_preapproval_id" text,
    "mp_init_point" text,
    "created_at" timestamp without time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "crew_subscriptions_plan_id_check"
        CHECK (("plan_id" = ANY (ARRAY['basico'::text, 'pro'::text]))),
    CONSTRAINT "crew_subscriptions_billing_period_check"
        CHECK (("billing_period" = ANY (ARRAY['monthly'::text, 'annual'::text]))),
    CONSTRAINT "crew_subscriptions_status_check"
        CHECK (("status" = ANY (ARRAY['pending'::text, 'authorized'::text, 'paused'::text, 'cancelled'::text])))
);

-- ---------------------------------------------------------------------
-- Vista: legacy, tampoco está referenciada hoy en el código del front.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW "public"."student_remaining_classes"
WITH (security_invoker = true) AS
 SELECT "s"."id" AS "student_id",
    "s"."name",
    "sub"."classes_total",
    count("a"."id") AS "classes_used",
    ("sub"."classes_total" - count("a"."id")) AS "classes_remaining"
   FROM (("public"."users" "s"
     JOIN "public"."subscriptions" "sub" ON (("sub"."student_id" = "s"."id")))
     LEFT JOIN "public"."attendances" "a" ON (("a"."student_id" = "s"."id")))
  WHERE ("s"."role" = 'student'::text)
  GROUP BY "s"."id", "s"."name", "sub"."classes_total";

-- ---------------------------------------------------------------------
-- Primary keys / unique constraints
-- ---------------------------------------------------------------------
ALTER TABLE ONLY "public"."gyms" ADD CONSTRAINT "gyms_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "unique_user_email_per_gym" UNIQUE ("gym_id", "email");
ALTER TABLE ONLY "public"."plans" ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."subscriptions" ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."attendances" ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."courses" ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."coach_assignments" ADD CONSTRAINT "coach_assignments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."coach_assignments" ADD CONSTRAINT "coach_assignments_coach_schedule_unique" UNIQUE ("coach_id", "schedule_type_id");
ALTER TABLE ONLY "public"."checkin_sessions" ADD CONSTRAINT "checkin_sessions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."checkin_sessions" ADD CONSTRAINT "checkin_sessions_token_key" UNIQUE ("token");
ALTER TABLE ONLY "public"."student_projects" ADD CONSTRAINT "student_projects_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."crew_subscriptions" ADD CONSTRAINT "crew_subscriptions_pkey" PRIMARY KEY ("id");

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_users_deleted_at" ON "public"."users" ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_users_blocked" ON "public"."users" ("blocked") WHERE "blocked" = false;
CREATE UNIQUE INDEX IF NOT EXISTS "unique_email_lower" ON "public"."users" (lower("email"));

CREATE INDEX IF NOT EXISTS "idx_gym_settings_gym_id" ON "public"."gym_settings" ("gym_id");
CREATE INDEX IF NOT EXISTS "idx_gym_settings_updated_at" ON "public"."gym_settings" ("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_payments_paid_at" ON "public"."payments" ("paid_at");
CREATE INDEX IF NOT EXISTS "idx_payments_student_id" ON "public"."payments" ("student_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_unique_freewall_month"
    ON "public"."payments" ("student_id", date_trunc('month', "paid_at"))
    WHERE ("schedule_type" = 'muro_libre'::text);

CREATE INDEX IF NOT EXISTS "idx_attendances_gym" ON "public"."attendances" ("gym_id");

CREATE INDEX IF NOT EXISTS "idx_coach_assignments_coach_id" ON "public"."coach_assignments" ("coach_id");

CREATE INDEX IF NOT EXISTS "idx_checkin_sessions_gym" ON "public"."checkin_sessions" ("gym_id");
CREATE INDEX IF NOT EXISTS "idx_checkin_sessions_token" ON "public"."checkin_sessions" ("token");

CREATE INDEX IF NOT EXISTS "crew_subscriptions_mp_preapproval_id_idx" ON "public"."crew_subscriptions" ("mp_preapproval_id");

-- ---------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");
ALTER TABLE ONLY "public"."plans" ADD CONSTRAINT "plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");
ALTER TABLE ONLY "public"."subscriptions" ADD CONSTRAINT "subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");
ALTER TABLE ONLY "public"."attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");
ALTER TABLE ONLY "public"."attendances" ADD CONSTRAINT "attendances_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");
ALTER TABLE ONLY "public"."courses" ADD CONSTRAINT "courses_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");
ALTER TABLE ONLY "public"."coach_assignments" ADD CONSTRAINT "coach_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."checkin_sessions" ADD CONSTRAINT "checkin_sessions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_projects" ADD CONSTRAINT "student_projects_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- A diferencia del esquema Crux original (donde users, gyms, plans,
-- courses, checkin_sessions y student_projects nunca tenían RLS
-- habilitado pese al GRANT a "anon" — quedaban completamente abiertas),
-- esta versión cierra esa brecha desde el arranque: las 6 tablas quedan
-- protegidas con el mismo criterio scoped-por-gym/rol que ya usan
-- attendances/payments/subscriptions. El GRANT ALL de más abajo sigue
-- siendo el patrón estándar de Supabase (RLS es la barrera real, el
-- GRANT es solo el interruptor general).
-- ---------------------------------------------------------------------

ALTER TABLE "public"."gym_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gym_settings_select_scoped" ON "public"."gym_settings"
FOR SELECT TO "authenticated"
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  OR gym_id IS NULL
  OR gym_id = (SELECT u2.gym_id FROM public.users u2 WHERE u2.id = auth.uid())
);

CREATE POLICY "gym_settings_insert_admin" ON "public"."gym_settings"
FOR INSERT TO "authenticated"
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "gym_settings_update_admin" ON "public"."gym_settings"
FOR UPDATE TO "authenticated"
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "gym_settings_delete_admin" ON "public"."gym_settings"
FOR DELETE TO "authenticated"
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendances_admin_scoped_all" ON "public"."attendances" TO "authenticated"
USING (EXISTS (
  SELECT 1 FROM public.users me
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND (me.gym_id IS NULL OR attendances.gym_id IS NULL OR attendances.gym_id = me.gym_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND (me.gym_id IS NULL OR attendances.gym_id IS NULL OR attendances.gym_id = me.gym_id)
));

CREATE POLICY "attendances_select_student_own" ON "public"."attendances"
FOR SELECT TO "authenticated" USING (student_id = auth.uid());

CREATE POLICY "attendances_select_coach_scoped" ON "public"."attendances"
FOR SELECT TO "authenticated"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = attendances.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND (me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

CREATE POLICY "attendances_insert_coach_scoped" ON "public"."attendances"
FOR INSERT TO "authenticated"
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = attendances.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND (me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

ALTER TABLE "public"."coach_assignments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_assignments_select_admin" ON "public"."coach_assignments"
FOR SELECT TO "authenticated"
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "coach_assignments_select_own" ON "public"."coach_assignments"
FOR SELECT TO "authenticated" USING (coach_id = auth.uid());
-- Nota: sin políticas de INSERT/UPDATE/DELETE a propósito — la escritura
-- de coach_assignments solo pasa por Edge Functions con service_role.

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_insert_admin_scoped" ON "public"."payments"
FOR INSERT TO "authenticated"
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND (me.gym_id IS NULL OR payments.student_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

CREATE POLICY "payments_select_admin_scoped" ON "public"."payments"
FOR SELECT TO "authenticated"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND (me.gym_id IS NULL OR payments.student_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

-- superadmin: solo lectura cross-gym (Dashboard global), ver current_user_role() más abajo.
CREATE POLICY "payments_select_superadmin" ON "public"."payments"
FOR SELECT TO "authenticated" USING (public.current_user_role() = 'superadmin');

CREATE POLICY "payments_select_student_own" ON "public"."payments"
FOR SELECT TO "authenticated" USING (student_id = auth.uid());

CREATE POLICY "payments_select_coach_scoped" ON "public"."payments"
FOR SELECT TO "authenticated"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND (payments.student_id IS NULL OR me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

CREATE POLICY "payments_insert_coach_scoped" ON "public"."payments"
FOR INSERT TO "authenticated"
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = payments.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND (payments.student_id IS NULL OR me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_admin_scoped_all" ON "public"."subscriptions" TO "authenticated"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = subscriptions.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND (me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = subscriptions.student_id
  WHERE me.id = auth.uid() AND me.role = 'admin'
    AND (me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

CREATE POLICY "subscriptions_select_student_own" ON "public"."subscriptions"
FOR SELECT TO "authenticated" USING (student_id = auth.uid());

CREATE POLICY "subscriptions_select_coach_scoped" ON "public"."subscriptions"
FOR SELECT TO "authenticated"
USING (EXISTS (
  SELECT 1 FROM public.users me
  LEFT JOIN public.users st ON st.id = subscriptions.student_id
  WHERE me.id = auth.uid() AND me.role = 'coach'
    AND (me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
));

-- crew_subscriptions: sin políticas — solo accesible con la service role key
-- (Edge Functions de checkout/webhook). Ninguna lectura/escritura pública.
ALTER TABLE "public"."crew_subscriptions" ENABLE ROW LEVEL SECURITY;

-- users: cada usuario ve/edita su propia fila; admin ve/edita todo su gym;
-- coach ve los alumnos de su gym. Sin política de INSERT a propósito — el
-- alta pasa por el trigger handle_new_user (SECURITY DEFINER, no pasa por
-- RLS) o por Edge Functions con service_role (create-coach-user, etc.).
--
-- Las policies de admin/coach NO subconsultan public.users directamente:
-- eso causaba "infinite recursion detected in policy for relation users"
-- (evaluar la policy dispara RLS sobre users de nuevo, que vuelve a evaluar
-- la misma policy). Se resuelve con funciones SECURITY DEFINER (dueño
-- "postgres", que tiene BYPASSRLS) que leen el rol/gym_id del usuario
-- actual sin volver a pasar por RLS. Fix aplicado en prod 2026-08-19.
CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION "public"."current_user_gym_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT gym_id FROM public.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM "public";
REVOKE ALL ON FUNCTION "public"."current_user_gym_id"() FROM "public";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_user_gym_id"() TO "authenticated";

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON "public"."users"
FOR SELECT TO "authenticated" USING (id = auth.uid());

CREATE POLICY "users_update_own" ON "public"."users"
FOR UPDATE TO "authenticated" USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "users_select_admin_scoped" ON "public"."users"
FOR SELECT TO "authenticated" USING (
  public.current_user_role() = 'admin'
  AND (public.current_user_gym_id() IS NULL OR users.gym_id IS NULL OR users.gym_id = public.current_user_gym_id())
);

CREATE POLICY "users_update_admin_scoped" ON "public"."users"
FOR UPDATE TO "authenticated"
USING (
  public.current_user_role() = 'admin'
  AND (public.current_user_gym_id() IS NULL OR users.gym_id IS NULL OR users.gym_id = public.current_user_gym_id())
)
WITH CHECK (
  public.current_user_role() = 'admin'
  AND (public.current_user_gym_id() IS NULL OR users.gym_id IS NULL OR users.gym_id = public.current_user_gym_id())
);

CREATE POLICY "users_select_coach_scoped" ON "public"."users"
FOR SELECT TO "authenticated" USING (
  users.role = 'student'
  AND public.current_user_role() = 'coach'
  AND (public.current_user_gym_id() IS NULL OR users.gym_id IS NULL OR users.gym_id = public.current_user_gym_id())
);

-- superadmin: solo lectura cross-gym (Dashboard global) — ve todos los usuarios de todos los gimnasios.
CREATE POLICY "users_select_superadmin" ON "public"."users"
FOR SELECT TO "authenticated" USING (public.current_user_role() = 'superadmin');

-- gyms: cualquier autenticado puede leer el nombre de SU gimnasio (lo necesitan
-- todos los roles para el header/perfil). Sin políticas de escritura — el alta
-- de un gimnasio es manual (ver docs/ROADMAP_WHITELABEL.md), vía service_role.
ALTER TABLE "public"."gyms" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gyms_select_own" ON "public"."gyms"
FOR SELECT TO "authenticated" USING (
  id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin' AND u.gym_id IS NULL)
);

-- Lectura pública (sin sesión): solo id/name viven en esta tabla, nada sensible.
-- Necesaria para /login?gym=<id> (link de invitación por gimnasio, ver Login.jsx) —
-- ahí todavía no hay sesión para que aplique gyms_select_own.
CREATE POLICY "gyms_select_public" ON "public"."gyms"
FOR SELECT TO "anon", "authenticated" USING (true);

-- plans: lectura scoped por gym (usada por AdminPayments/Students para
-- alinear el pack pagado con un plan). Sin escritura desde el cliente hoy.
ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_scoped" ON "public"."plans"
FOR SELECT TO "authenticated" USING (
  gym_id IS NULL
  OR gym_id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin' AND u.gym_id IS NULL)
);

-- courses: lectura scoped por gym (StudentCourses, StudentDashboard). Sin
-- escritura desde el cliente hoy.
ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_select_scoped" ON "public"."courses"
FOR SELECT TO "authenticated" USING (
  gym_id IS NULL
  OR gym_id = (SELECT u.gym_id FROM public.users u WHERE u.id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin' AND u.gym_id IS NULL)
);

-- checkin_sessions: legacy, no referenciada por el frontend actual. Se cierra
-- del todo — sin políticas — hasta que se use de nuevo o se elimine.
ALTER TABLE "public"."checkin_sessions" ENABLE ROW LEVEL SECURITY;

-- student_projects: el alumno ve/crea sus propios proyectos; admin los ve
-- scoped por gym.
ALTER TABLE "public"."student_projects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_projects_select_own" ON "public"."student_projects"
FOR SELECT TO "authenticated" USING (student_id = auth.uid());

CREATE POLICY "student_projects_insert_own" ON "public"."student_projects"
FOR INSERT TO "authenticated" WITH CHECK (student_id = auth.uid());

CREATE POLICY "student_projects_select_admin_scoped" ON "public"."student_projects"
FOR SELECT TO "authenticated" USING (
  EXISTS (
    SELECT 1 FROM public.users me
    LEFT JOIN public.users st ON st.id = student_projects.student_id
    WHERE me.id = auth.uid() AND me.role = 'admin'
      AND (me.gym_id IS NULL OR st.gym_id IS NULL OR st.gym_id = me.gym_id)
  )
);

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."attendances";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."checkin_sessions";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payments";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."student_projects";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."subscriptions";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";

-- ---------------------------------------------------------------------
-- Grants — patrón estándar de Supabase: el GRANT habilita el acceso a
-- nivel de tabla, RLS (arriba) filtra qué filas puede ver/tocar cada rol.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA "public" TO "postgres", "anon", "authenticated", "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon", "authenticated", "service_role";

GRANT ALL ON TABLE "public"."gyms" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."users" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."gym_settings" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."plans" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."subscriptions" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."payments" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."attendances" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."courses" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."coach_assignments" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."checkin_sessions" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."student_projects" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."student_remaining_classes" TO "anon", "authenticated", "service_role";
-- crew_subscriptions: sin grants a anon/authenticated a propósito (solo service_role la usa).
GRANT ALL ON TABLE "public"."crew_subscriptions" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres", "anon", "authenticated", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres", "anon", "authenticated", "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres", "anon", "authenticated", "service_role";

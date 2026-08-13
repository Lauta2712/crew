


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attendances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "gym_id" "uuid",
    "attended_at" timestamp without time zone DEFAULT "now"(),
    "checkin_method" "text"
);


ALTER TABLE "public"."attendances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gym_id" "uuid" NOT NULL,
    "token" "uuid" NOT NULL,
    "expires_at" timestamp without time zone NOT NULL,
    "used" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."checkin_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "schedule_type_id" "text" NOT NULL,
    "gym_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."coach_assignments" IS 'Horarios que cada profesor puede gestionar (IDs alineados a SCHEDULE_TYPES en la app)';



COMMENT ON COLUMN "public"."coach_assignments"."schedule_type_id" IS 'Ej.: muro_libre, escuela_multi, escuela_gordo, escuelita';



COMMENT ON COLUMN "public"."coach_assignments"."gym_id" IS 'Gimnasio del alcance del profe (nullable si aplica a todos)';



CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gym_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "level" "text",
    "start_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gyms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."gyms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid",
    "amount" numeric,
    "payment_method" "text",
    "paid_at" timestamp without time zone DEFAULT "now"(),
    "student_id" "uuid",
    "pack_type" "text",
    "schedule_type" "text"
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gym_id" "uuid",
    "name" "text",
    "classes_per_month" integer,
    "price" numeric,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "plan_id" "uuid",
    "start_date" "date",
    "end_date" "date",
    "classes_total" integer,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gym_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "blocked" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."student_remaining_classes" AS
 SELECT "s"."id" AS "student_id",
    "s"."name",
    "sub"."classes_total",
    "count"("a"."id") AS "classes_used",
    ("sub"."classes_total" - "count"("a"."id")) AS "classes_remaining"
   FROM (("public"."users" "s"
     JOIN "public"."subscriptions" "sub" ON (("sub"."student_id" = "s"."id")))
     LEFT JOIN "public"."attendances" "a" ON (("a"."student_id" = "s"."id")))
  WHERE ("s"."role" = 'student'::"text")
  GROUP BY "s"."id", "s"."name", "sub"."classes_total";


ALTER VIEW "public"."student_remaining_classes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."coach_assignments"
    ADD CONSTRAINT "coach_assignments_coach_schedule_unique" UNIQUE ("coach_id", "schedule_type_id");



ALTER TABLE ONLY "public"."coach_assignments"
    ADD CONSTRAINT "coach_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gyms"
    ADD CONSTRAINT "gyms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_projects"
    ADD CONSTRAINT "student_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "unique_user_email_per_gym" UNIQUE ("gym_id", "email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_attendances_gym" ON "public"."attendances" USING "btree" ("gym_id");



CREATE INDEX "idx_checkin_sessions_gym" ON "public"."checkin_sessions" USING "btree" ("gym_id");



CREATE INDEX "idx_checkin_sessions_token" ON "public"."checkin_sessions" USING "btree" ("token");



CREATE INDEX "idx_coach_assignments_coach_id" ON "public"."coach_assignments" USING "btree" ("coach_id");



CREATE INDEX "idx_payments_paid_at" ON "public"."payments" USING "btree" ("paid_at");



CREATE INDEX "idx_payments_student_id" ON "public"."payments" USING "btree" ("student_id");



CREATE UNIQUE INDEX "payments_unique_freewall_month" ON "public"."payments" USING "btree" ("student_id", "date_trunc"('month'::"text", "paid_at")) WHERE ("schedule_type" = 'muro_libre'::"text");



CREATE UNIQUE INDEX "unique_attendance_per_day" ON "public"."attendances" USING "btree" ("student_id", "date"("attended_at"));



CREATE UNIQUE INDEX "unique_email_lower" ON "public"."users" USING "btree" ("lower"("email"));



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_assignments"
    ADD CONSTRAINT "coach_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE ONLY "public"."student_projects"
    ADD CONSTRAINT "student_projects_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendances_admin_scoped_all" ON "public"."attendances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND (("me"."gym_id" IS NULL) OR ("attendances"."gym_id" IS NULL) OR ("attendances"."gym_id" = "me"."gym_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND (("me"."gym_id" IS NULL) OR ("attendances"."gym_id" IS NULL) OR ("attendances"."gym_id" = "me"."gym_id"))))));



CREATE POLICY "attendances_select_student_own" ON "public"."attendances" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



ALTER TABLE "public"."coach_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_assignments_select_admin" ON "public"."coach_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



CREATE POLICY "coach_assignments_select_own" ON "public"."coach_assignments" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_insert_admin_scoped" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."users" "me"
     LEFT JOIN "public"."users" "st" ON (("st"."id" = "payments"."student_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND (("me"."gym_id" IS NULL) OR ("payments"."student_id" IS NULL) OR ("st"."gym_id" IS NULL) OR ("st"."gym_id" = "me"."gym_id"))))));



CREATE POLICY "payments_select_admin_scoped" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."users" "me"
     LEFT JOIN "public"."users" "st" ON (("st"."id" = "payments"."student_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND (("me"."gym_id" IS NULL) OR ("payments"."student_id" IS NULL) OR ("st"."gym_id" IS NULL) OR ("st"."gym_id" = "me"."gym_id"))))));



CREATE POLICY "payments_select_student_own" ON "public"."payments" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_admin_scoped_all" ON "public"."subscriptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."users" "me"
     LEFT JOIN "public"."users" "st" ON (("st"."id" = "subscriptions"."student_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND (("me"."gym_id" IS NULL) OR ("st"."gym_id" IS NULL) OR ("st"."gym_id" = "me"."gym_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."users" "me"
     LEFT JOIN "public"."users" "st" ON (("st"."id" = "subscriptions"."student_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND (("me"."gym_id" IS NULL) OR ("st"."gym_id" IS NULL) OR ("st"."gym_id" = "me"."gym_id"))))));



CREATE POLICY "subscriptions_select_student_own" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "users_select_students_active" ON "public"."users" FOR SELECT TO "authenticated" USING ((("role" = 'student'::"text") AND ("deleted_at" IS NULL)));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."attendances";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."checkin_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."student_projects";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."subscriptions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


















GRANT ALL ON TABLE "public"."attendances" TO "anon";
GRANT ALL ON TABLE "public"."attendances" TO "authenticated";
GRANT ALL ON TABLE "public"."attendances" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_sessions" TO "anon";
GRANT ALL ON TABLE "public"."checkin_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."coach_assignments" TO "anon";
GRANT ALL ON TABLE "public"."coach_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."gyms" TO "anon";
GRANT ALL ON TABLE "public"."gyms" TO "authenticated";
GRANT ALL ON TABLE "public"."gyms" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."student_projects" TO "anon";
GRANT ALL ON TABLE "public"."student_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."student_projects" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."student_remaining_classes" TO "anon";
GRANT ALL ON TABLE "public"."student_remaining_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."student_remaining_classes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































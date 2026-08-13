-- Suscripciones de Crew (el producto) a cada gimnasio cliente — NO confundir con
-- "public"."subscriptions", que es la suscripción de un alumno a un plan de SU gimnasio.
-- Esta tabla trackea el cobro recurrente vía Mercado Pago (preapproval) desde que alguien
-- deja sus datos en la landing hasta que se le da de alta el gimnasio manualmente.
CREATE TABLE IF NOT EXISTS "public"."crew_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_name" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "gym_name" "text",
    "plan_id" "text" NOT NULL,
    "billing_period" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "mp_preapproval_id" "text",
    "mp_init_point" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crew_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crew_subscriptions_plan_id_check" CHECK (("plan_id" = ANY (ARRAY['basico'::"text", 'pro'::"text"]))),
    CONSTRAINT "crew_subscriptions_billing_period_check" CHECK (("billing_period" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "crew_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'authorized'::"text", 'paused'::"text", 'cancelled'::"text"])))
);

ALTER TABLE "public"."crew_subscriptions" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "crew_subscriptions_mp_preapproval_id_idx"
    ON "public"."crew_subscriptions" ("mp_preapproval_id");

-- Sin políticas: solo accesible con la service role key (desde las Edge Functions de
-- checkout/webhook). No hay lectura ni escritura pública ni de usuarios autenticados.
ALTER TABLE "public"."crew_subscriptions" ENABLE ROW LEVEL SECURITY;

-- Almacena la franja horaria específica elegida dentro de un tipo de horario.
-- Formato: "<days>|<time>", ej: "Lunes y Miércoles|15:00 – 16:30".
-- NULL = sin preferencia específica (horarios con una sola franja, o pagos anteriores a este cambio).
ALTER TABLE "public"."payments"
  ADD COLUMN IF NOT EXISTS "schedule_slot" text;

COMMENT ON COLUMN "public"."payments"."schedule_slot" IS
  'Franja horaria específica elegida dentro del schedule_type. Formato: "days|time". NULL = cualquier franja del horario (retrocompatible).';

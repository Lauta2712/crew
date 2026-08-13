-- Un alumno puede asistir más de una vez por día (ej. clase + muro libre).
-- El índice único impedía registrar la segunda asistencia y generaba un error
-- genérico al escanear el QR después de renovar un pack el mismo día.
DROP INDEX IF EXISTS "public"."unique_attendance_per_day";

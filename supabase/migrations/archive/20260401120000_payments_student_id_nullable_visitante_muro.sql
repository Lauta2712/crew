-- Pagos de muro para personas sin cuenta Crux: student_id NULL (pase diario registrado por el profe).
ALTER TABLE public.payments
  ALTER COLUMN student_id DROP NOT NULL;

COMMENT ON COLUMN public.payments.student_id IS
  'Estudiante Crux que pagó; NULL = visitante (p. ej. pase diario muro sin usuario en el sistema).';

-- Migración: agregar columnas para registro de pago por pack/horario (admin)
-- La tabla payments actual tiene: subscription_id, amount, payment_method, paid_at.
-- Se agregan student_id, pack_type y schedule_type para el flujo "Registrar pago"
-- sin depender de subscriptions. subscription_id queda opcional para compatibilidad.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS pack_type text,
  ADD COLUMN IF NOT EXISTS schedule_type text;

COMMENT ON COLUMN public.payments.student_id IS 'Estudiante que pagó (para registros desde admin sin subscription)';
COMMENT ON COLUMN public.payments.pack_type IS 'ID del pack: single, pack4, pack8';
COMMENT ON COLUMN public.payments.schedule_type IS 'ID del horario: muro_libre, escuela_multi, etc.';

-- Índice para listar pagos por estudiante (calendario y reportes)
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at);

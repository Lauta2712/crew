-- Add schedule_type_id to attendances table.
-- This column stores the schedule type (e.g. 'muro_libre', 'escuela_multi') for each attendance record.
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS schedule_type_id text;

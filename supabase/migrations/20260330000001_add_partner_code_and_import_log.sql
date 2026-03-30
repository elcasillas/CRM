-- Add partner_code (stable external ID) for CSV import deduplication
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS partner_code text;

CREATE UNIQUE INDEX IF NOT EXISTS partners_partner_code_idx
  ON public.partners (lower(trim(partner_code)))
  WHERE partner_code IS NOT NULL AND trim(partner_code) <> '';

-- Import log — tracks every CSV import run
CREATE TABLE IF NOT EXISTS public.partner_health_import_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_at   timestamptz NOT NULL DEFAULT now(),
  imported_by   uuid        REFERENCES auth.users(id),
  row_count     integer     NOT NULL DEFAULT 0,
  partner_count integer     NOT NULL DEFAULT 0,
  skipped_count integer     NOT NULL DEFAULT 0,
  error_count   integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'success'
                CHECK (status IN ('success', 'partial', 'failed')),
  message       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_health_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view import log"
  ON public.partner_health_import_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert import log"
  ON public.partner_health_import_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

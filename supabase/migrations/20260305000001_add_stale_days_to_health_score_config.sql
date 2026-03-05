ALTER TABLE public.health_score_config
  ADD COLUMN IF NOT EXISTS stale_days integer NOT NULL DEFAULT 30;

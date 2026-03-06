ALTER TABLE public.health_score_config
  ADD COLUMN IF NOT EXISTS new_deal_days integer NOT NULL DEFAULT 14;

-- ── partner_health_config ─────────────────────────────────────────────────────
-- Single-row admin configuration table for the Partner Health Index.
-- No RLS — accessed exclusively via admin API routes with the service role key.
-- Same pattern as health_score_config and inspection_config.

CREATE TABLE public.partner_health_config (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_weights jsonb       NOT NULL DEFAULT '{"revenue":20,"product":15,"customer":15,"engagement":15,"support":10,"financial":10,"growth":10,"strategic":5}'::jsonb,
  thresholds       jsonb       NOT NULL DEFAULT '{"healthy":75,"at_risk":50,"critical":25}'::jsonb,
  stale_days       int         NOT NULL DEFAULT 30,
  model_version    text        NOT NULL DEFAULT 'phi-1',
  updated_at       timestamptz,
  updated_by       uuid        REFERENCES auth.users
);

ALTER TABLE public.partner_health_config ENABLE ROW LEVEL SECURITY;

-- Seed with one default row
INSERT INTO public.partner_health_config DEFAULT VALUES;

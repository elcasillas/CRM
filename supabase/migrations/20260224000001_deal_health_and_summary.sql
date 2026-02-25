-- Migration: Deal health scores, AI summary cache, and stage win probability
-- Ported from DealUpdates (github.com/elcasillas/DealUpdates)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. deal_stages: add win_probability for health score stage component
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.deal_stages
  ADD COLUMN IF NOT EXISTS win_probability SMALLINT;

-- Seed sensible defaults based on existing flags and sort_order
UPDATE public.deal_stages SET win_probability = CASE
  WHEN is_lost             THEN 0
  WHEN is_won              THEN 100
  WHEN sort_order <= 2     THEN 20
  WHEN sort_order <= 4     THEN 45
  WHEN sort_order <= 6     THEN 70
  ELSE                          85
END
WHERE win_probability IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. deals: add health score columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS health_score         SMALLINT,
  ADD COLUMN IF NOT EXISTS hs_stage_probability SMALLINT,
  ADD COLUMN IF NOT EXISTS hs_velocity          SMALLINT,
  ADD COLUMN IF NOT EXISTS hs_activity_recency  SMALLINT,
  ADD COLUMN IF NOT EXISTS hs_close_date        SMALLINT,
  ADD COLUMN IF NOT EXISTS hs_acv               SMALLINT,
  ADD COLUMN IF NOT EXISTS hs_notes_signal      SMALLINT,
  ADD COLUMN IF NOT EXISTS health_debug         JSONB,
  ADD COLUMN IF NOT EXISTS notes_hash           TEXT;

CREATE INDEX IF NOT EXISTS idx_deals_health_score ON public.deals (health_score);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. deal_summary_cache: AI-generated note summaries (cache-first)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_summary_cache (
  deal_id    UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  notes_hash TEXT        NOT NULL,
  model      TEXT        NOT NULL DEFAULT 'haiku',
  summary    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, notes_hash, model)
);

ALTER TABLE public.deal_summary_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "summary_cache: select if deal visible"
  ON public.deal_summary_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND public.can_view_account(auth.uid(), d.account_id)
    )
  );

CREATE POLICY "summary_cache: insert if deal visible"
  ON public.deal_summary_cache FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND public.can_view_account(auth.uid(), d.account_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_summary_cache_notes_hash
  ON public.deal_summary_cache (notes_hash);

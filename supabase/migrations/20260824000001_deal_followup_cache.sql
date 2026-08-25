-- ─────────────────────────────────────────────────────────────────────────────
-- deal_followup_cache: persisted AI follow-up items, one row per deal
--
-- Shared by both entry points: the Email/Template actions on a single deal and
-- the per-salesperson report. Only the generated items are stored. The deal
-- name and the "days since last note" line are assembled at render time from
-- live data, so a cached row can never show a stale day count.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deal_followup_cache (
  deal_id      UUID        PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  items        TEXT        NOT NULL,
  model        TEXT        NOT NULL DEFAULT 'haiku',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_followup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "followup_cache: select if deal visible"
  ON public.deal_followup_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND public.can_view_account(auth.uid(), d.account_id)
    )
  );

CREATE POLICY "followup_cache: insert if deal visible"
  ON public.deal_followup_cache FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND public.can_view_account(auth.uid(), d.account_id)
    )
  );

CREATE POLICY "followup_cache: update if deal visible"
  ON public.deal_followup_cache FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND public.can_view_account(auth.uid(), d.account_id)
    )
  );

DROP TRIGGER IF EXISTS set_updated_at_deal_followup_cache ON public.deal_followup_cache;
CREATE TRIGGER set_updated_at_deal_followup_cache
  BEFORE UPDATE ON public.deal_followup_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

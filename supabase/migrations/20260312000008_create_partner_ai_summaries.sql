-- ── partner_ai_summaries ──────────────────────────────────────────────────────
-- Cache table for AI-generated partner insights.
-- Cache key: (partner_id, metrics_hash, model) — same pattern as deal_summary_cache.
-- metrics_hash is a SHA-256 of the canonical metrics snapshot + scores.
-- When the hash matches, the cached summary is returned without calling the LLM.

CREATE TABLE public.partner_ai_summaries (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id             uuid        NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  metrics_hash           text        NOT NULL,
  executive_summary      text,
  risk_summary           text,
  growth_summary         text,
  recommended_actions    jsonb,
  outreach_email_subject text,
  outreach_email_body    text,
  qbr_talking_points     jsonb,
  model                  text        NOT NULL,
  generated_at           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, metrics_hash, model)
);

ALTER TABLE public.partner_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_ai_summaries: select visible"
  ON public.partner_ai_summaries FOR SELECT
  USING (public.can_view_partner(auth.uid(), partner_id));

CREATE POLICY "partner_ai_summaries: insert visible"
  ON public.partner_ai_summaries FOR INSERT
  WITH CHECK (public.can_view_partner(auth.uid(), partner_id));

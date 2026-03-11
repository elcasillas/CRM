-- ── partner_metrics ───────────────────────────────────────────────────────────
-- Stores raw metric inputs per partner per month.
-- Each row is one metric key + value for a given month.
-- The UNIQUE constraint on (partner_id, metric_date, metric_key) allows safe
-- upserts when the account manager updates data.
--
-- metric_date is always the first day of the month:
--   DATE_TRUNC('month', NOW())::date
--
-- Categories: revenue | product | customer | engagement | support | financial |
--             growth | strategic

CREATE TABLE public.partner_metrics (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid        NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  metric_date  date        NOT NULL,
  category     text        NOT NULL
                           CHECK (category IN (
                             'revenue','product','customer','engagement',
                             'support','financial','growth','strategic'
                           )),
  metric_key   text        NOT NULL,
  metric_value numeric,
  source       text        NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual','crm','api','import')),
  notes        text,
  created_by   uuid        REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, metric_date, metric_key)
);

CREATE TRIGGER partner_metrics_updated_at
  BEFORE UPDATE ON public.partner_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_metrics: select visible"
  ON public.partner_metrics FOR SELECT
  USING (public.can_view_partner(auth.uid(), partner_id));

CREATE POLICY "partner_metrics: insert visible"
  ON public.partner_metrics FOR INSERT
  WITH CHECK (public.can_view_partner(auth.uid(), partner_id));

CREATE POLICY "partner_metrics: update visible"
  ON public.partner_metrics FOR UPDATE
  USING (public.can_view_partner(auth.uid(), partner_id));

CREATE POLICY "partner_metrics: delete visible"
  ON public.partner_metrics FOR DELETE
  USING (public.can_view_partner(auth.uid(), partner_id));

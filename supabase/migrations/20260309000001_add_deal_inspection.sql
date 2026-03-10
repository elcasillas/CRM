-- Add inspection result columns to deals
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS inspection_score    SMALLINT,
  ADD COLUMN IF NOT EXISTS inspection_run_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspection_result   JSONB;

-- Single-row inspection config table (same pattern as health_score_config)
CREATE TABLE IF NOT EXISTS public.inspection_config (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  checks      JSONB        NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ  DEFAULT now(),
  updated_by  UUID         REFERENCES auth.users
);

-- All authenticated users can read config (same as health_score_config)
ALTER TABLE public.inspection_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inspection config"
  ON public.inspection_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can modify inspection config"
  ON public.inspection_config FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

-- Seed with 15 default inspection checks
INSERT INTO public.inspection_config (checks) VALUES ('[
  {"id":"stage_valid","label":"Deal stage is present and valid","severity":"critical","enabled":true},
  {"id":"close_date_credible","label":"Close date is present and still credible","severity":"critical","enabled":true},
  {"id":"amount_reasonable","label":"Amount is present and reasonable","severity":"critical","enabled":true},
  {"id":"contract_term","label":"Contract term is present","severity":"medium","enabled":true},
  {"id":"acv_tcv_aligned","label":"ACV and TCV are present and aligned","severity":"medium","enabled":true},
  {"id":"next_step_defined","label":"Next step is clearly defined","severity":"critical","enabled":true},
  {"id":"next_step_owner","label":"Next step owner is clear","severity":"medium","enabled":true},
  {"id":"next_step_date","label":"Next step date is present","severity":"medium","enabled":true},
  {"id":"recent_update","label":"Last meaningful update is recent","severity":"medium","enabled":true},
  {"id":"decision_process","label":"Customer decision process is described","severity":"critical","enabled":true},
  {"id":"economic_buyer","label":"Economic buyer or key decision maker is identified","severity":"critical","enabled":true},
  {"id":"business_problem","label":"Business problem or use case is defined","severity":"medium","enabled":true},
  {"id":"blockers_documented","label":"Blockers or risks are documented","severity":"medium","enabled":true},
  {"id":"customer_intent","label":"Customer intent or commitment level is described","severity":"critical","enabled":true},
  {"id":"implementation_target","label":"Timeline or implementation target is documented","severity":"low","enabled":true}
]');

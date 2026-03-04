-- Health score configuration table (admin-only, single row)
CREATE TABLE public.health_score_config (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  weights    jsonb NOT NULL DEFAULT '{"stageProbability":25,"velocity":20,"activityRecency":15,"closeDateIntegrity":10,"acv":15,"notesSignal":15}',
  keywords   jsonb NOT NULL DEFAULT '{"positive":["budget confirmed","legal engaged","exec sponsor","timeline committed","verbal commit","procurement"],"negative":["no response","circling back","waiting on approval","reviewing internally","pushed","delayed","stalled"]}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users
);

-- RLS enabled — no direct client access; all access via admin API routes using service role key
ALTER TABLE public.health_score_config ENABLE ROW LEVEL SECURITY;

-- Seed with one default row
INSERT INTO public.health_score_config DEFAULT VALUES;

-- Clear stored AI summaries so they regenerate with the new structured format.
-- The deal_summary_cache is keyed by model tag; the new tag 'haiku-s1' already
-- forces cache misses. This clears the denormalized copy on the deals table so
-- users see the Summarize button rather than the old unstructured summary.
UPDATE public.deals
SET ai_summary = NULL, ai_summary_generated_at = NULL
WHERE ai_summary IS NOT NULL;

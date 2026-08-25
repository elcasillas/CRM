-- ─────────────────────────────────────────────────────────────────────────────
-- Track the stage the follow-up items were generated for
--
-- Follow-up content is now scoped to the criteria appropriate to the deal's
-- stage, which makes saved items stage-specific. A deal that advances from
-- Initial Conversation to Solution Qualified therefore has saved content that
-- is still inside the seven day window but asks about the wrong things.
--
-- Storing the stage the items were generated for lets a stage change count as
-- staleness independently of age. Existing rows get NULL, which reads as
-- unknown and forces one regeneration each: correct, since they were generated
-- before any stage scoping existed.
--
-- Deliberately no foreign key. This is a snapshot token used to detect change,
-- not a relationship, and adding one would require another index on a table
-- read only by primary key.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.deal_followup_cache
  ADD COLUMN IF NOT EXISTS stage_id UUID;

COMMENT ON COLUMN public.deal_followup_cache.stage_id IS
  'Deal stage the items were generated for. A change means the saved items no longer match the stage scope and must be regenerated.';

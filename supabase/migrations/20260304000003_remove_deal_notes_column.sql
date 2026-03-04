-- Migrate existing deal_notes into the notes table, then drop the column

INSERT INTO public.notes (entity_type, entity_id, note_text, created_by, created_at)
SELECT
  'deal'         AS entity_type,
  id             AS entity_id,
  deal_notes     AS note_text,
  deal_owner_id  AS created_by,
  created_at
FROM public.deals
WHERE deal_notes IS NOT NULL AND deal_notes <> '';

ALTER TABLE public.deals DROP COLUMN deal_notes;

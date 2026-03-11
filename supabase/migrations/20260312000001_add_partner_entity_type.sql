-- Extend notes.entity_type check constraint to include 'partner'.
-- This allows CRM notes to be attached directly to partner records,
-- enabling note-freshness scoring in the Partner Health Index.

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_entity_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_entity_type_check
  CHECK (entity_type IN ('account', 'deal', 'contact', 'contract', 'hid', 'partner'));

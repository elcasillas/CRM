-- Deduplicate notes that were inserted multiple times during CSV re-imports.
--
-- Root cause: the existingNotes dedup query in the import route used
-- .in('entity_id', allIds) with up to 1295 UUIDs, exceeding PostgREST's URL
-- length limit. The query returned null, leaving the dedup map empty, causing
-- every re-import to bypass duplicate detection and insert fresh copies.
--
-- This migration keeps exactly one row per (entity_type, entity_id, note_text)
-- combination — the earliest-created one — and deletes the rest.
-- A unique index is then added to prevent future duplicates at the DB level.

DELETE FROM public.notes
WHERE id NOT IN (
  SELECT DISTINCT ON (entity_type, entity_id, note_text) id
  FROM   public.notes
  ORDER  BY entity_type, entity_id, note_text, created_at ASC, id ASC
);

-- Prevent duplicate notes at the DB level going forward.
CREATE UNIQUE INDEX IF NOT EXISTS notes_entity_text_unique
  ON public.notes (entity_type, entity_id, note_text);

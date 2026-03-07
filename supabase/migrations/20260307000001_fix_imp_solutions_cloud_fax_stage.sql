-- One-time fix: "IMP Solutions Cloud Fax (20K pages)" was stuck at Solutions Qualified
-- because the CSV import did not update stage_id on existing deals (only appended notes).
-- The CSV (Notes_-_Last_Time_Modified0307.csv) lists this deal as Closed Lost on all rows.
-- Root cause has been fixed in app/api/deals/import/route.ts — existing deals now have
-- their stage_id (and other value fields) updated on every import.

UPDATE public.deals
SET stage_id = (
  SELECT id FROM public.deal_stages
  WHERE LOWER(TRIM(stage_name)) = 'closed lost'
  LIMIT 1
)
WHERE LOWER(TRIM(deal_name)) = 'imp solutions cloud fax (20k pages)'
  AND stage_id != (
    SELECT id FROM public.deal_stages
    WHERE LOWER(TRIM(stage_name)) = 'closed lost'
    LIMIT 1
  );

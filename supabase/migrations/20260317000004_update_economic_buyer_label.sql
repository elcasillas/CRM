-- Rename "economic_buyer" check label across all stored locations.
-- 1. inspection_config: the live admin-configurable row
-- 2. deals.inspection_result: historical per-deal inspection snapshots

-- 1. Update inspection_config.checks JSONB
UPDATE public.inspection_config
SET checks = (
  SELECT jsonb_agg(
    CASE
      WHEN item->>'id' = 'economic_buyer'
        THEN jsonb_set(item, '{label}', '"Executive decision maker is identified"')
      ELSE item
    END
  )
  FROM jsonb_array_elements(checks) AS item
)
WHERE checks IS NOT NULL;

-- 2. Update deals.inspection_result.checks JSONB for all historical records
UPDATE public.deals
SET inspection_result = jsonb_set(
  inspection_result,
  '{checks}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id' = 'economic_buyer'
          THEN jsonb_set(item, '{label}', '"Executive decision maker is identified"')
        ELSE item
      END
    )
    FROM jsonb_array_elements(inspection_result->'checks') AS item
  )
)
WHERE inspection_result IS NOT NULL
  AND jsonb_typeof(inspection_result->'checks') = 'array';

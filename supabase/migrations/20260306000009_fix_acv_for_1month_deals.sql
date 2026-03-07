-- For 1-month contracts ACV = Amount × 1 (not × 12).
-- Previous backfill used amount × 12 unconditionally; correct those rows.
UPDATE public.deals
   SET value_amount = amount
 WHERE contract_term_months = 1
   AND amount IS NOT NULL;

-- Move renewal date from accounts to contracts.
-- contracts.renewal_date already exists; this migration removes the
-- now-redundant renewal_contract_date column from accounts.

ALTER TABLE public.accounts DROP COLUMN IF EXISTS renewal_contract_date;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS entity_name TEXT;

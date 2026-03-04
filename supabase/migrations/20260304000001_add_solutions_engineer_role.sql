-- Add solutions_engineer to the profiles role check constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'sales', 'solutions_engineer', 'service_manager', 'read_only'));

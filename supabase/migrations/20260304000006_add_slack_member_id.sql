ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slack_member_id text DEFAULT NULL;

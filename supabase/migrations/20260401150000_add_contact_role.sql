-- Add role column to contacts table
-- Represents the contact's relationship to a deal opportunity.
-- Nullable so existing contacts are unaffected.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS role text
    CHECK (role IN ('Champion', 'Decision Maker', 'Influencer', 'Blocker'));

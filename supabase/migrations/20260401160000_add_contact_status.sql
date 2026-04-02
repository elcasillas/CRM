-- Add status column to contacts table
-- Defaults to 'Active' so all existing records get a sensible value.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Prospect', 'Inactive'));

-- Add industry classification to accounts
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS industry text
  CHECK (industry IN ('Teleco', 'Cableco', 'Hoster', 'MSP', 'Marketplace', 'Virtual Office'));

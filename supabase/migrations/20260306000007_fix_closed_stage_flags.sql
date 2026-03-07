-- Ensure closed stages have is_closed = true.
-- The original insert used ON CONFLICT DO NOTHING, so pre-existing rows
-- may have is_closed = false if they were created before this flag existed.
UPDATE public.deal_stages
   SET is_closed = true, is_won = true,  is_lost = false
 WHERE stage_name = 'Closed Implemented';

UPDATE public.deal_stages
   SET is_closed = true, is_won = false, is_lost = true
 WHERE stage_name = 'Closed Lost';

-- Add worksheet_data column to persist embedded worksheet state on deal detail page
ALTER TABLE deals ADD COLUMN IF NOT EXISTS worksheet_data jsonb;

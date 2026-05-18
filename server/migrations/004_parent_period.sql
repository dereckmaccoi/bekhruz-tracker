-- Add parent_id to periods so weeks can belong to a campaign (big period)
ALTER TABLE periods ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES periods(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_periods_parent ON periods(parent_id);

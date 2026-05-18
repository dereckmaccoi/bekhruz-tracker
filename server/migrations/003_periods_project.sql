-- Add project_id to periods so each project can have its own independent period list
ALTER TABLE periods ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

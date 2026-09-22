ALTER TABLE guests ADD COLUMN IF NOT EXISTS guest_status text NOT NULL DEFAULT 'new';
CREATE INDEX IF NOT EXISTS guests_status_idx ON guests (guest_status);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS guests_active_idx ON guests (venue_id) WHERE archived_at IS NULL;

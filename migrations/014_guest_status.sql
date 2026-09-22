ALTER TABLE guests ADD COLUMN IF NOT EXISTS guest_status text NOT NULL DEFAULT 'new';
CREATE INDEX IF NOT EXISTS guests_status_idx ON guests (guest_status);

-- Keep guest phone identity scoped to a venue for multi-point deployments.
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS guests_venue_phone_unique ON guests (venue_id, phone);

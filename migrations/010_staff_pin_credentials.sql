-- Self-service four-digit staff PIN, encrypted for owner/manager visibility.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_data_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_data_iv text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_data_tag text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_pin_updated ON users (venue_id, pin_updated_at DESC);

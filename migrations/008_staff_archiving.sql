-- Keep employment and audit history while allowing the owner to remove a
-- departed employee from the operational personnel list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_active_directory
  ON users (venue_id, full_name)
  WHERE deleted_at IS NULL;

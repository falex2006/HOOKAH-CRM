-- Remember the venue selected in each browser session without changing the
-- user's home venue. This keeps multi-venue work isolated per device/session.
ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS active_venue_id uuid;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_venue
  ON auth_sessions (active_venue_id);

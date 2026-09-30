CREATE TABLE IF NOT EXISTS notification_reads (
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key text NOT NULL CHECK (length(notification_key) BETWEEN 1 AND 180),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS notification_reads_user_venue_read_at_idx
  ON notification_reads (user_id, venue_id, read_at DESC);

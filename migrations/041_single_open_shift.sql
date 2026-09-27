DO $$
BEGIN
  IF EXISTS (
    SELECT venue_id
    FROM shifts
    WHERE closed_at IS NULL
    GROUP BY venue_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot enforce one open shift per venue: duplicate open shifts exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_venue_idx
  ON shifts (venue_id)
  WHERE closed_at IS NULL;

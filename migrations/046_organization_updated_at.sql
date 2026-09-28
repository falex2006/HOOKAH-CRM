-- Keep organization edits timestamped, matching subscription and venue records.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

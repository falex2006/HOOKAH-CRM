-- Staff employment metadata for the personnel mini-database.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employment_started_at date,
  ADD COLUMN IF NOT EXISTS work_notes text NOT NULL DEFAULT '';

COMMENT ON COLUMN users.employment_started_at IS 'First working day recorded by an authorized administrator.';
COMMENT ON COLUMN users.work_notes IS 'Internal work notes visible only to authorized staff managers.';

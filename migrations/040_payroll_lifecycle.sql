-- Add audit metadata for payroll review and payout transitions.
-- Existing payroll rows (including legacy drafts and linked expenses) are
-- intentionally left untouched; historical approval/payment state is unknown.
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Replace the original CHECK with a replay-safe expanded lifecycle CHECK.
ALTER TABLE payroll_entries
  DROP CONSTRAINT IF EXISTS payroll_entries_status_check,
  DROP CONSTRAINT IF EXISTS payroll_entries_lifecycle_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payroll_entries_lifecycle_status_check'
      AND conrelid = 'payroll_entries'::regclass
  ) THEN
    ALTER TABLE payroll_entries
      ADD CONSTRAINT payroll_entries_lifecycle_status_check
      CHECK (status IN ('draft','approved','paid','cancelled'));
  END IF;
END
$$;

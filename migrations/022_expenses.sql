CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','payroll','purchase','other')),
  document_url text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_venue_date_idx ON expenses(venue_id, expense_date);
-- The deployment script may replay every migration against an existing volume.
-- Add the relation only when it is not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payroll_entries_expense_fk'
      AND conrelid = 'payroll_entries'::regclass
  ) THEN
    ALTER TABLE payroll_entries
      ADD CONSTRAINT payroll_entries_expense_fk
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
  END IF;
END
$$;

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
ALTER TABLE payroll_entries ADD CONSTRAINT payroll_entries_expense_fk FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;

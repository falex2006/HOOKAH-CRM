CREATE TABLE IF NOT EXISTS staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  planned_start timestamptz,
  planned_end timestamptz,
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id, work_date)
);
CREATE INDEX IF NOT EXISTS staff_schedules_venue_date_idx ON staff_schedules(venue_id, work_date);

CREATE TABLE IF NOT EXISTS staff_work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','shift','device')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_work_logs_venue_user_idx ON staff_work_logs(venue_id, user_id, started_at);

CREATE TABLE IF NOT EXISTS payroll_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('hourly','monthly','percent_revenue','per_shift')),
  rate numeric(12,2) NOT NULL CHECK (rate >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES payroll_rules(id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  expense_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id, period_from, period_to, rule_id)
);
CREATE INDEX IF NOT EXISTS payroll_entries_venue_period_idx ON payroll_entries(venue_id, period_from, period_to);

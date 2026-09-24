CREATE TABLE IF NOT EXISTS inventory_subdepartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  department_code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, department_code, name)
);
CREATE INDEX IF NOT EXISTS inventory_subdepartments_active_idx
  ON inventory_subdepartments (venue_id, department_code, is_active, name);

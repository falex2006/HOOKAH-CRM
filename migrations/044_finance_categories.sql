CREATE TABLE IF NOT EXISTS finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_active_name_uq
  ON finance_categories (venue_id, kind, lower(name)) WHERE active=true;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='expenses_finance_category_fk'
      AND conrelid='expenses'::regclass
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_finance_category_fk
      FOREIGN KEY (venue_id, category_id)
      REFERENCES finance_categories (venue_id, id)
      ON DELETE SET NULL (category_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS expenses_venue_category_idx
  ON expenses (venue_id, category_id) WHERE category_id IS NOT NULL;

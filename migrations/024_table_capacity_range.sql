ALTER TABLE tables ADD COLUMN IF NOT EXISTS min_capacity integer NOT NULL DEFAULT 1;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS max_capacity integer NOT NULL DEFAULT 1;
UPDATE tables SET min_capacity = COALESCE(NULLIF(min_capacity, 0), capacity), max_capacity = COALESCE(NULLIF(max_capacity, 0), capacity);
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_capacity_range_check;
-- Keep this migration safe when the VPS migration runner is executed again.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tables_capacity_range_check'
      AND conrelid = 'tables'::regclass
  ) THEN
    ALTER TABLE tables
      ADD CONSTRAINT tables_capacity_range_check
      CHECK (min_capacity >= 1 AND max_capacity >= min_capacity AND max_capacity <= 100);
  END IF;
END
$$;

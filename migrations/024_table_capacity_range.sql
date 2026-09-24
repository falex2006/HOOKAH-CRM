ALTER TABLE tables ADD COLUMN IF NOT EXISTS min_capacity integer NOT NULL DEFAULT 1;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS max_capacity integer NOT NULL DEFAULT 1;
UPDATE tables SET min_capacity = COALESCE(NULLIF(min_capacity, 0), capacity), max_capacity = COALESCE(NULLIF(max_capacity, 0), capacity);
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_capacity_range_check;
ALTER TABLE tables ADD CONSTRAINT tables_capacity_range_check CHECK (min_capacity >= 1 AND max_capacity >= min_capacity AND max_capacity <= 100);

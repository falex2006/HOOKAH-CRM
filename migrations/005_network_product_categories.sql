-- Persist network venue metadata and product categories for existing databases.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'кальян-бар';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_active_name
  ON product_categories (venue_id, lower(name)) WHERE is_active;

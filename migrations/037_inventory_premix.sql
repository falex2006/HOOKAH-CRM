CREATE TABLE IF NOT EXISTS inventory_premix_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES inventory_recipe_cards(id) ON DELETE RESTRICT,
  output_ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  output_quantity numeric(12,3) NOT NULL CHECK (output_quantity > 0),
  output_unit text NOT NULL,
  total_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  produced_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_premix_batches_venue_idx ON inventory_premix_batches(venue_id, created_at DESC);
ALTER TABLE inventory_recipe_cards ADD COLUMN IF NOT EXISTS recipe_type text NOT NULL DEFAULT 'sale';
DO $$ BEGIN
  ALTER TABLE inventory_recipe_cards ADD CONSTRAINT inventory_recipe_cards_recipe_type_check CHECK (recipe_type IN ('sale','premix'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

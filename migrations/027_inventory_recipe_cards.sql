CREATE TABLE IF NOT EXISTS inventory_recipe_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  technology text,
  serve text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_recipe_cards_venue_idx ON inventory_recipe_cards(venue_id, active, name);

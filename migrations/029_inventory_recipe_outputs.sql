ALTER TABLE inventory_recipe_cards
  ADD COLUMN IF NOT EXISTS yield_quantity numeric(12,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS yield_unit text NOT NULL DEFAULT 'порция',
  ADD COLUMN IF NOT EXISTS portion_count integer NOT NULL DEFAULT 1;

ALTER TABLE inventory_recipe_cards
  DROP CONSTRAINT IF EXISTS inventory_recipe_cards_yield_quantity_check,
  DROP CONSTRAINT IF EXISTS inventory_recipe_cards_portion_count_check;

ALTER TABLE inventory_recipe_cards
  ADD CONSTRAINT inventory_recipe_cards_yield_quantity_check CHECK (yield_quantity > 0),
  ADD CONSTRAINT inventory_recipe_cards_portion_count_check CHECK (portion_count > 0);

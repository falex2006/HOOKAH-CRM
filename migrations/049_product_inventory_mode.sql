-- Make the stock-vs-service decision explicit. Existing products are only
-- classified as tracked when a sale recipe is unambiguous; unknown legacy
-- products require review before they can close a sale.
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_mode text;

UPDATE products p
SET inventory_mode='tracked'
WHERE p.inventory_mode IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM inventory_recipe_cards c
      WHERE c.venue_id=p.venue_id AND c.active=true AND c.recipe_type='sale'
        AND c.product_id=p.id
        AND (SELECT count(*) FROM inventory_recipe_cards direct_card
             WHERE direct_card.venue_id=p.venue_id AND direct_card.active=true
               AND direct_card.recipe_type='sale' AND direct_card.product_id=p.id)=1
        AND jsonb_typeof(c.ingredients)='array' AND jsonb_array_length(c.ingredients)>0
    )
    OR EXISTS (
      SELECT 1 FROM inventory_recipe_cards c
      WHERE c.venue_id=p.venue_id AND c.active=true AND c.recipe_type='sale'
        AND c.product_id IS NULL AND lower(btrim(c.name))=lower(btrim(p.name))
        AND (SELECT count(*) FROM products same_product
             WHERE same_product.venue_id=p.venue_id AND lower(btrim(same_product.name))=lower(btrim(p.name)))=1
        AND (SELECT count(*) FROM inventory_recipe_cards same_card
             WHERE same_card.venue_id=p.venue_id AND same_card.active=true AND same_card.recipe_type='sale'
               AND same_card.product_id IS NULL AND lower(btrim(same_card.name))=lower(btrim(p.name)))=1
        AND jsonb_typeof(c.ingredients)='array' AND jsonb_array_length(c.ingredients)>0
    )
    OR EXISTS (
      SELECT 1
      FROM recipes legacy_recipe
      JOIN recipe_items legacy_item ON legacy_item.product_id=legacy_recipe.product_id
      JOIN ingredients legacy_ingredient ON legacy_ingredient.id=legacy_item.ingredient_id
        AND legacy_ingredient.venue_id=p.venue_id
      WHERE legacy_recipe.product_id=p.id AND legacy_item.quantity>0
    )
  );

UPDATE products SET inventory_mode='needs_review' WHERE inventory_mode IS NULL;

ALTER TABLE products ALTER COLUMN inventory_mode SET DEFAULT 'tracked';
ALTER TABLE products ALTER COLUMN inventory_mode SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_inventory_mode_check
    CHECK (inventory_mode IN ('tracked','non_stock','needs_review'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS products_venue_inventory_mode_idx
  ON products (venue_id, inventory_mode) WHERE is_active=true;

-- Stock documents and recipe calculations retain up to six decimal places.
-- Keep the ledger at the same precision so posted receipts and consumption
-- match their source quantities exactly instead of rounding each movement.
ALTER TABLE stock_movements
  ALTER COLUMN quantity TYPE numeric(15,6)
  USING quantity::numeric(15,6);

-- Package conversion factors feed purchase quantities, so retain the same
-- precision as inventory purchase document lines.
ALTER TABLE ingredients
  ALTER COLUMN pack_multiplier TYPE numeric(15,6)
  USING pack_multiplier::numeric(15,6),
  ALTER COLUMN min_stock TYPE numeric(15,6)
  USING min_stock::numeric(15,6);

-- Recipe rows must use the same scale as the recipe parser and stock ledger.
ALTER TABLE recipe_items
  ALTER COLUMN quantity TYPE numeric(15,6)
  USING quantity::numeric(15,6);

-- Premix output is also stock quantity; keep it aligned with the ledger.
ALTER TABLE inventory_premix_batches
  ALTER COLUMN output_quantity TYPE numeric(15,6)
  USING output_quantity::numeric(15,6);

-- Purchase source units and converted stock quantities both retain six places.
ALTER TABLE inventory_purchase_document_lines
  ALTER COLUMN quantity TYPE numeric(17,6)
  USING quantity::numeric(17,6),
  ALTER COLUMN pack_multiplier TYPE numeric(15,6)
  USING pack_multiplier::numeric(15,6),
  ALTER COLUMN stock_quantity TYPE numeric(15,6)
  USING stock_quantity::numeric(15,6);

-- Full-schema installs start with the same package precision.
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS pack_multiplier numeric(15,6) NOT NULL DEFAULT 1 CHECK (pack_multiplier > 0);

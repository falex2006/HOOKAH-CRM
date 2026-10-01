-- Track planned/actual premix output and append-only per-lot stock allocations.
-- Existing batches retain their recorded output as both planned and actual;
-- historical stock movements remain unallocated because their source lot is
-- not recoverable reliably.
ALTER TABLE inventory_premix_batches
  ADD COLUMN IF NOT EXISTS planned_output_quantity numeric(15,6),
  ADD COLUMN IF NOT EXISTS previous_output_cost numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS output_movement_id uuid UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'produced',
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

UPDATE inventory_premix_batches
   SET planned_output_quantity=output_quantity
 WHERE planned_output_quantity IS NULL;
ALTER TABLE inventory_premix_batches
  ALTER COLUMN planned_output_quantity SET NOT NULL,
  ALTER COLUMN planned_output_quantity SET DEFAULT 0,
  DROP CONSTRAINT IF EXISTS inventory_premix_batch_status_check,
  DROP CONSTRAINT IF EXISTS inventory_premix_batch_void_metadata_check,
  DROP CONSTRAINT IF EXISTS inventory_premix_batch_planned_quantity_check,
  ADD CONSTRAINT inventory_premix_batch_status_check
    CHECK (status IN ('produced','voided')),
  ADD CONSTRAINT inventory_premix_batch_void_metadata_check
    CHECK ((status='produced' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
        OR (status='voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)),
  ADD CONSTRAINT inventory_premix_batch_planned_quantity_check
    CHECK (planned_output_quantity > 0);

CREATE INDEX IF NOT EXISTS inventory_premix_batches_fifo_idx
  ON inventory_premix_batches(venue_id, output_ingredient_id, expires_at, created_at)
  WHERE status='produced';

CREATE OR REPLACE FUNCTION inventory_premix_batch_output_scope_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement_venue uuid; movement_item uuid;
BEGIN
  IF NEW.output_movement_id IS NULL THEN RETURN NEW; END IF;
  SELECT venue_id,ingredient_id INTO movement_venue,movement_item
    FROM stock_movements WHERE id=NEW.output_movement_id;
  IF movement_venue IS NULL OR movement_venue IS DISTINCT FROM NEW.venue_id
     OR movement_item IS DISTINCT FROM NEW.output_ingredient_id THEN
    RAISE EXCEPTION 'premix_batch_output_movement_scope_mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_premix_batch_output_scope_guard ON inventory_premix_batches;
CREATE TRIGGER inventory_premix_batch_output_scope_guard
BEFORE INSERT OR UPDATE OF output_movement_id,venue_id,output_ingredient_id ON inventory_premix_batches
FOR EACH ROW EXECUTE FUNCTION inventory_premix_batch_output_scope_guard();

CREATE TABLE IF NOT EXISTS inventory_premix_batch_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES inventory_premix_batches(id) ON DELETE RESTRICT,
  stock_movement_id uuid REFERENCES stock_movements(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('consumption','waste','adjustment','reversal')),
  quantity_delta numeric(15,6) NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 200),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_premix_batch_movements_batch_idx
  ON inventory_premix_batch_movements(batch_id, created_at, id);

CREATE OR REPLACE FUNCTION inventory_premix_batch_movement_scope_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_venue uuid; batch_item uuid; movement_venue uuid; movement_item uuid;
BEGIN
  SELECT venue_id, output_ingredient_id INTO batch_venue, batch_item
    FROM inventory_premix_batches WHERE id=NEW.batch_id;
  IF batch_venue IS NULL OR NEW.venue_id IS DISTINCT FROM batch_venue THEN
    RAISE EXCEPTION 'premix_batch_venue_mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.stock_movement_id IS NOT NULL THEN
    SELECT venue_id, ingredient_id INTO movement_venue, movement_item
      FROM stock_movements WHERE id=NEW.stock_movement_id;
    IF movement_venue IS NULL OR movement_venue IS DISTINCT FROM NEW.venue_id
       OR movement_item IS DISTINCT FROM batch_item THEN
      RAISE EXCEPTION 'premix_batch_movement_scope_mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_premix_batch_movement_scope_guard ON inventory_premix_batch_movements;
CREATE TRIGGER inventory_premix_batch_movement_scope_guard
BEFORE INSERT OR UPDATE ON inventory_premix_batch_movements
FOR EACH ROW EXECUTE FUNCTION inventory_premix_batch_movement_scope_guard();

CREATE OR REPLACE FUNCTION inventory_premix_batch_movement_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'premix_batch_movements_are_append_only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS inventory_premix_batch_movement_immutable_guard ON inventory_premix_batch_movements;
CREATE TRIGGER inventory_premix_batch_movement_immutable_guard
BEFORE UPDATE OR DELETE ON inventory_premix_batch_movements
FOR EACH ROW EXECUTE FUNCTION inventory_premix_batch_movement_immutable_guard();

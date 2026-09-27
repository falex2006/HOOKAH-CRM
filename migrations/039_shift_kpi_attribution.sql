-- Explicit shift attribution for payments and closed orders.
-- Existing records remain NULL: their historical shift cannot be determined
-- reliably from timestamps (especially across overnight/overlapping shifts).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE RESTRICT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS closed_in_shift_id uuid REFERENCES shifts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payments_shift_status
  ON payments (shift_id, status) WHERE shift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_closed_shift
  ON orders (closed_in_shift_id) WHERE closed_in_shift_id IS NOT NULL;

CREATE OR REPLACE FUNCTION payment_shift_venue_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_venue uuid; shift_venue uuid;
BEGIN
  IF NEW.shift_id IS NULL THEN RETURN NEW; END IF;
  SELECT venue_id INTO order_venue FROM orders WHERE id=NEW.order_id;
  SELECT venue_id INTO shift_venue FROM shifts WHERE id=NEW.shift_id;
  IF order_venue IS NULL OR shift_venue IS NULL OR order_venue IS DISTINCT FROM shift_venue THEN
    RAISE EXCEPTION 'payment_shift_venue_mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_shift_venue_guard ON payments;
CREATE TRIGGER payment_shift_venue_guard
BEFORE INSERT OR UPDATE OF order_id, shift_id ON payments
FOR EACH ROW EXECUTE FUNCTION payment_shift_venue_guard();

CREATE OR REPLACE FUNCTION order_closed_shift_venue_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shift_venue uuid;
BEGIN
  IF NEW.closed_in_shift_id IS NULL THEN RETURN NEW; END IF;
  SELECT venue_id INTO shift_venue FROM shifts WHERE id=NEW.closed_in_shift_id;
  IF shift_venue IS NULL OR NEW.venue_id IS DISTINCT FROM shift_venue THEN
    RAISE EXCEPTION 'order_closed_shift_venue_mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_closed_shift_venue_guard ON orders;
CREATE TRIGGER order_closed_shift_venue_guard
BEFORE INSERT OR UPDATE OF venue_id, closed_in_shift_id ON orders
FOR EACH ROW EXECUTE FUNCTION order_closed_shift_venue_guard();

-- Persisted purchase / receipt documents.
--
-- This migration is additive and intentionally does not backfill existing
-- stock_movements. Existing movements remain the source of truth for their
-- historical quantities and costs. New receiving code should create a
-- document, its lines, and the linked stock_movements in one transaction.
--
-- Compatibility:
--   * supplier_name and document_number are document metadata; no supplier
--     master table is required by this migration.
--   * document_date is the date printed on the supplier document.
--   * recorded_at is the CRM/server time when the document was recorded.
--   * receipt_unit_cost is the immutable normalized cost snapshot used for
--     future audit/reporting. ingredients.cost may continue to change as a
--     weighted current cost and must not be used to rewrite this snapshot.
--   * source_movement_id is nullable so a draft can exist before posting and
--     so legacy movements do not need synthetic document rows. Once linked,
--     the movement is RESTRICT-protected: the stock ledger must retain the
--     source link; corrections use an adjustment movement instead of delete.
--   * source_auto_order_id is nullable because manual receipts are valid.
--
-- Rollback (only before the API starts creating documents):
--   DROP TABLE IF EXISTS inventory_purchase_document_lines;
--   DROP TABLE IF EXISTS inventory_purchase_documents;
--   DROP FUNCTION IF EXISTS inventory_purchase_document_status_guard();
--   DROP FUNCTION IF EXISTS inventory_purchase_document_immutable_guard();
--   DROP FUNCTION IF EXISTS inventory_purchase_line_price_guard();
--   DROP FUNCTION IF EXISTS inventory_purchase_line_scope_guard();
--   DROP FUNCTION IF EXISTS inventory_purchase_line_lifecycle_guard();
--   DROP FUNCTION IF EXISTS inventory_purchase_document_delete_guard();
--   DROP FUNCTION IF EXISTS inventory_purchase_source_order_scope_guard();
-- This removes only the new tables and never deletes historical stock rows.

CREATE TABLE IF NOT EXISTS inventory_purchase_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  supplier_name text NOT NULL DEFAULT 'Не указан',
  document_number text,
  document_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'voided')),
  note text,
  source_auto_order_id uuid REFERENCES inventory_auto_orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  posted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  CHECK (length(btrim(supplier_name)) BETWEEN 1 AND 160),
  CHECK (document_number IS NULL OR length(btrim(document_number)) BETWEEN 1 AND 80),
  CHECK (note IS NULL OR length(note) <= 2000),
  UNIQUE (venue_id, document_number)
);

CREATE INDEX IF NOT EXISTS inventory_purchase_documents_venue_date_idx
  ON inventory_purchase_documents(venue_id, document_date DESC, recorded_at DESC);
CREATE INDEX IF NOT EXISTS inventory_purchase_documents_venue_status_idx
  ON inventory_purchase_documents(venue_id, status, recorded_at DESC);
CREATE INDEX IF NOT EXISTS inventory_purchase_documents_auto_order_idx
  ON inventory_purchase_documents(source_auto_order_id)
  WHERE source_auto_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION inventory_purchase_source_order_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_venue uuid;
BEGIN
  IF NEW.source_auto_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT venue_id INTO source_venue FROM inventory_auto_orders WHERE id=NEW.source_auto_order_id;
  IF source_venue IS NULL OR source_venue IS DISTINCT FROM NEW.venue_id THEN
    RAISE EXCEPTION 'invalid_source_auto_order'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_source_order_scope_guard
  ON inventory_purchase_documents;
CREATE TRIGGER inventory_purchase_source_order_scope_guard
BEFORE INSERT OR UPDATE OF source_auto_order_id, venue_id ON inventory_purchase_documents
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_source_order_scope_guard();

CREATE TABLE IF NOT EXISTS inventory_purchase_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES inventory_purchase_documents(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  ingredient_name_snapshot text NOT NULL,
  stock_unit text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  pack_multiplier numeric(14,6) NOT NULL DEFAULT 1 CHECK (pack_multiplier > 0),
  stock_quantity numeric(14,6) NOT NULL CHECK (stock_quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  receipt_unit_cost numeric(14,6) NOT NULL CHECK (receipt_unit_cost >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  source_movement_id uuid UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(ingredient_name_snapshot)) BETWEEN 1 AND 160),
  CHECK (length(btrim(stock_unit)) BETWEEN 1 AND 30),
  CHECK (length(btrim(unit)) BETWEEN 1 AND 30)
);

CREATE INDEX IF NOT EXISTS inventory_purchase_lines_document_idx
  ON inventory_purchase_document_lines(document_id);
CREATE INDEX IF NOT EXISTS inventory_purchase_lines_venue_ingredient_idx
  ON inventory_purchase_document_lines(venue_id, ingredient_id, created_at DESC);

-- A posted receipt cannot be voided until a reversal workflow exists. Drafts
-- may be voided; posted documents remain immutable and corrections use a
-- separate stock adjustment document.
CREATE OR REPLACE FUNCTION inventory_purchase_document_status_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status = 'draft' AND NEW.status IN ('posted', 'voided'))
     ) THEN
    RAISE EXCEPTION 'inventory_purchase_status_transition_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_document_status_guard
  ON inventory_purchase_documents;
CREATE TRIGGER inventory_purchase_document_status_guard
BEFORE UPDATE OF status ON inventory_purchase_documents
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_document_status_guard();

CREATE OR REPLACE FUNCTION inventory_purchase_document_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('posted', 'voided') AND (
       OLD.venue_id IS DISTINCT FROM NEW.venue_id
       OR OLD.supplier_name IS DISTINCT FROM NEW.supplier_name
       OR OLD.document_number IS DISTINCT FROM NEW.document_number
       OR OLD.document_date IS DISTINCT FROM NEW.document_date
       OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
       OR OLD.note IS DISTINCT FROM NEW.note
       OR OLD.source_auto_order_id IS DISTINCT FROM NEW.source_auto_order_id
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.posted_by IS DISTINCT FROM NEW.posted_by
       OR OLD.posted_at IS DISTINCT FROM NEW.posted_at
     ) THEN
    RAISE EXCEPTION 'inventory_purchase_document_immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_document_immutable_guard
  ON inventory_purchase_documents;
CREATE TRIGGER inventory_purchase_document_immutable_guard
BEFORE UPDATE ON inventory_purchase_documents
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_document_immutable_guard();

-- Price and quantity snapshots may be edited while a document is draft. Once
-- posted, they are immutable; a correction must be represented by a new
-- document/stock adjustment rather than rewriting history.
CREATE OR REPLACE FUNCTION inventory_purchase_line_price_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document_status text;
BEGIN
  SELECT status INTO document_status
    FROM inventory_purchase_documents
   WHERE id = OLD.document_id;
  IF document_status IN ('posted', 'voided') AND (
       OLD.document_id IS DISTINCT FROM NEW.document_id
       OR OLD.venue_id IS DISTINCT FROM NEW.venue_id
       OR OLD.ingredient_id IS DISTINCT FROM NEW.ingredient_id
       OR OLD.ingredient_name_snapshot IS DISTINCT FROM NEW.ingredient_name_snapshot
       OR OLD.stock_unit IS DISTINCT FROM NEW.stock_unit
       OR OLD.quantity IS DISTINCT FROM NEW.quantity
       OR OLD.unit IS DISTINCT FROM NEW.unit
       OR OLD.pack_multiplier IS DISTINCT FROM NEW.pack_multiplier
       OR OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity
       OR OLD.unit_cost IS DISTINCT FROM NEW.unit_cost
       OR OLD.receipt_unit_cost IS DISTINCT FROM NEW.receipt_unit_cost
       OR OLD.line_total IS DISTINCT FROM NEW.line_total
       OR OLD.source_movement_id IS DISTINCT FROM NEW.source_movement_id
     ) THEN
    RAISE EXCEPTION 'inventory_purchase_line_immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_line_price_guard
  ON inventory_purchase_document_lines;
CREATE TRIGGER inventory_purchase_line_price_guard
BEFORE UPDATE ON inventory_purchase_document_lines
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_line_price_guard();

-- Keep the document/ingredient/movement references inside one venue. The
-- application must still filter every query by venue_id; this trigger adds a
-- database-level guard against an accidental cross-venue receipt link.
CREATE OR REPLACE FUNCTION inventory_purchase_line_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document_venue uuid;
  ingredient_venue uuid;
  movement_venue uuid;
  movement_ingredient uuid;
BEGIN
  SELECT venue_id INTO document_venue
    FROM inventory_purchase_documents WHERE id = NEW.document_id;
  SELECT venue_id INTO ingredient_venue
    FROM ingredients WHERE id = NEW.ingredient_id;
  IF document_venue IS NULL OR ingredient_venue IS NULL
     OR NEW.venue_id IS DISTINCT FROM document_venue
     OR NEW.venue_id IS DISTINCT FROM ingredient_venue THEN
    RAISE EXCEPTION 'inventory_purchase_line_scope_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.source_movement_id IS NOT NULL THEN
    SELECT venue_id, ingredient_id INTO movement_venue, movement_ingredient
      FROM stock_movements WHERE id = NEW.source_movement_id;
    IF movement_venue IS NULL
       OR movement_venue IS DISTINCT FROM NEW.venue_id
       OR movement_ingredient IS DISTINCT FROM NEW.ingredient_id THEN
      RAISE EXCEPTION 'inventory_purchase_source_movement_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_line_scope_guard
  ON inventory_purchase_document_lines;
CREATE TRIGGER inventory_purchase_line_scope_guard
BEFORE INSERT OR UPDATE ON inventory_purchase_document_lines
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_line_scope_guard();

CREATE OR REPLACE FUNCTION inventory_purchase_line_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document_status text;
BEGIN
  SELECT status INTO document_status
    FROM inventory_purchase_documents
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END
   FOR UPDATE;
  IF document_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'inventory_purchase_line_immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_line_lifecycle_guard
  ON inventory_purchase_document_lines;
CREATE TRIGGER inventory_purchase_line_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON inventory_purchase_document_lines
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_line_lifecycle_guard();

CREATE OR REPLACE FUNCTION inventory_purchase_document_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('posted', 'voided') THEN
    RAISE EXCEPTION 'inventory_purchase_document_immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS inventory_purchase_document_delete_guard
  ON inventory_purchase_documents;
CREATE TRIGGER inventory_purchase_document_delete_guard
BEFORE DELETE ON inventory_purchase_documents
FOR EACH ROW
EXECUTE FUNCTION inventory_purchase_document_delete_guard();

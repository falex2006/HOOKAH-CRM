-- Link supplier-payment cash movements to their posted receipt documents.
-- Existing manual purchase expenses remain intact and unlinked.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS purchase_document_id uuid
    REFERENCES inventory_purchase_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expenses_purchase_source_check'
      AND conrelid = 'expenses'::regclass
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_purchase_source_check
      CHECK (purchase_document_id IS NULL OR source = 'purchase');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expenses_purchase_payment_method_check'
      AND conrelid = 'expenses'::regclass
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_purchase_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('cash','card','bank_transfer','other'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_venue_idempotency_key_uq
  ON expenses(venue_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_purchase_document_idx
  ON expenses(venue_id, purchase_document_id, expense_date)
  WHERE purchase_document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_expense_purchase_document_venue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.purchase_document_id IS NOT NULL THEN
    IF NEW.source <> 'purchase' THEN
      RAISE EXCEPTION 'purchase_document_requires_purchase_source';
    END IF;
    PERFORM 1
      FROM inventory_purchase_documents d
      WHERE d.id = NEW.purchase_document_id
        AND d.venue_id = NEW.venue_id
        AND d.status = 'posted';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase_document_missing_wrong_venue_or_not_posted';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS expenses_purchase_document_venue_guard ON expenses;
CREATE TRIGGER expenses_purchase_document_venue_guard
  BEFORE INSERT OR UPDATE OF venue_id,source,purchase_document_id ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_expense_purchase_document_venue();

-- A supplier's printed document date may be unknown. Keep it separate from
-- recorded_at/posted_at and represent the unknown date as NULL.
ALTER TABLE inventory_purchase_documents
  ALTER COLUMN document_date DROP DEFAULT,
  ALTER COLUMN document_date DROP NOT NULL;

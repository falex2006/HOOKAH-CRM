-- Preserve the optional second name used by the guest card and reservation picker.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT '';

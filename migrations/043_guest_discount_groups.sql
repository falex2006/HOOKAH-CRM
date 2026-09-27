CREATE TABLE IF NOT EXISTS guest_discount_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  bonus_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (bonus_percent BETWEEN 0 AND 100),
  deposit_min numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_min >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_discount_groups_venue_name_uq
  ON guest_discount_groups (venue_id, lower(name));

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS discount_group_id uuid,
  ADD COLUMN IF NOT EXISTS deposit_balance numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guests_discount_group_fk'
      AND conrelid = 'guests'::regclass
  ) THEN
    ALTER TABLE guests
      ADD CONSTRAINT guests_discount_group_fk
      FOREIGN KEY (venue_id, discount_group_id)
      REFERENCES guest_discount_groups (venue_id, id)
      ON DELETE SET NULL (discount_group_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guests_deposit_balance_nonnegative'
      AND conrelid = 'guests'::regclass
  ) THEN
    ALTER TABLE guests
      ADD CONSTRAINT guests_deposit_balance_nonnegative CHECK (deposit_balance >= 0);
  END IF;
END
$$;

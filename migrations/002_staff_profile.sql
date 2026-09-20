-- Staff profile contacts and protected personnel data.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_url text,
  ADD COLUMN IF NOT EXISTS phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS passport_data_encrypted text,
  ADD COLUMN IF NOT EXISTS passport_data_iv text,
  ADD COLUMN IF NOT EXISTS passport_data_tag text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_numbers_array_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_numbers_array_check
      CHECK (jsonb_typeof(phone_numbers) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN users.passport_data_encrypted IS 'AES-GCM encrypted personnel data; decrypt only in the application with STAFF_PASSPORT_KEY.';
COMMENT ON COLUMN users.phone_numbers IS 'Array of {label, number, primary} contact objects.';

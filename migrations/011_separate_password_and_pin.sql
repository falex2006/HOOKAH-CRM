ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
-- Accounts created before the separate credential fields used pin_hash for login.
-- Preserve those passwords while leaving rows with a configured unlock PIN intact.
UPDATE users SET password_hash = pin_hash WHERE password_hash IS NULL AND pin_hash IS NOT NULL AND pin_updated_at IS NULL;

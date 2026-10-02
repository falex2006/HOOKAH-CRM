-- Contact address only: not an authentication or recovery identifier.
-- Nullable and additive; old installations and existing employees are preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email text;

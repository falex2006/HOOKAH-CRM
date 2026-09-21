ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permission_scopes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN users.permission_scopes IS 'Owner-assigned management directions for admin accounts; an empty array preserves the role default.';

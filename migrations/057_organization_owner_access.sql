ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS organization_one_primary_owner
  ON organization_memberships (organization_id) WHERE membership_role='owner' AND is_primary=true;
UPDATE organization_memberships m SET is_primary=true
WHERE m.membership_role='owner'
  AND NOT EXISTS (SELECT 1 FROM organization_memberships x WHERE x.organization_id=m.organization_id AND x.membership_role='owner' AND x.is_primary=true)
  AND m.user_id=(SELECT u.id FROM users u WHERE u.id=m.user_id ORDER BY u.created_at LIMIT 1);
CREATE INDEX IF NOT EXISTS users_password_reset_token_idx ON users(password_reset_token_hash) WHERE password_reset_token_hash IS NOT NULL;

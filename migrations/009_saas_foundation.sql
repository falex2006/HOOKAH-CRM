-- SaaS foundation: one account can own several CRM venues.
-- Existing venue-scoped data remains compatible; organization_id is backfilled
-- from the current venue and becomes the tenant boundary for future modules.
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','network','enterprise')),
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role text NOT NULL DEFAULT 'member' CHECK (membership_role IN ('owner','admin','member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','network','enterprise')),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','cancelled')),
  seats_limit integer NOT NULL DEFAULT 5 CHECK (seats_limit > 0),
  venues_limit integer NOT NULL DEFAULT 1 CHECK (venues_limit > 0),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_venues_organization ON venues (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users (organization_id, is_active);

-- Stable bootstrap account for existing single-venue installations.
INSERT INTO organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000010', 'Территория', 'territory', 'starter')
ON CONFLICT (slug) DO NOTHING;
UPDATE venues SET organization_id='00000000-0000-0000-0000-000000000010' WHERE organization_id IS NULL;
UPDATE users u SET organization_id=v.organization_id FROM venues v WHERE u.venue_id=v.id AND u.organization_id IS NULL;
INSERT INTO organization_memberships (organization_id, user_id, membership_role)
SELECT '00000000-0000-0000-0000-000000000010', u.id,
  CASE WHEN u.role='owner' THEN 'owner' WHEN u.role='admin' THEN 'admin' ELSE 'member' END
FROM users u
WHERE u.organization_id='00000000-0000-0000-0000-000000000010'
ON CONFLICT (organization_id, user_id) DO NOTHING;
INSERT INTO organization_subscriptions (organization_id, plan, status, seats_limit, venues_limit)
VALUES ('00000000-0000-0000-0000-000000000010', 'starter', 'trialing', 5, 1)
ON CONFLICT (organization_id) DO NOTHING;

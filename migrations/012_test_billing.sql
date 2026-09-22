-- Test billing metadata. Prices remain zero until a payment provider is enabled.
ALTER TABLE organization_subscriptions ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'test_free' CHECK (billing_mode IN ('test_free','live'));
ALTER TABLE organization_subscriptions ADD COLUMN IF NOT EXISTS monthly_price_cents integer NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0);
ALTER TABLE organization_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

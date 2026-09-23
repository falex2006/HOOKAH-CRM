CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('owner','admin','manager','senior_bartender','senior_hookah_master','bartender','hookah_master','developer','platform_owner','cleaner','security','technician','other_staff');
CREATE TYPE table_status AS ENUM ('free','occupied','reserved','awaiting_payment','blocked');
CREATE TYPE order_status AS ENUM ('open','in_progress','ready','closed','cancelled');
CREATE TYPE payment_status AS ENUM ('pending','paid','refunded','partially_paid');
CREATE TYPE discount_status AS ENUM ('requested','approved','rejected','applied','cancelled');
CREATE TYPE stock_direction AS ENUM ('in','out','transfer','adjustment','waste');

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  format text NOT NULL DEFAULT 'кальян-бар',
  city text,
  is_current boolean NOT NULL DEFAULT false,
  phone text,
  address text,
  logo_url text,
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','network','enterprise')),
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'кальян-бар';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id),
  full_name text NOT NULL,
  login text NOT NULL UNIQUE,
  pin_hash text,
  avatar_url text,
  role user_role NOT NULL,
  permission_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_scopes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_data_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_data_iv text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_data_tag text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_updated_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

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
  updated_at timestamptz NOT NULL DEFAULT now(),
  billing_mode text NOT NULL DEFAULT 'test_free' CHECK (billing_mode IN ('test_free','live')),
  monthly_price_cents integer NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  trial_ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at);

CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 2 CHECK (capacity > 0),
  status table_status NOT NULL DEFAULT 'free',
  min_deposit numeric(12,2) NOT NULL DEFAULT 0,
  min_order_total numeric(12,2) NOT NULL DEFAULT 0,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id),
  phone text,
  full_name text,
  email text,
  loyalty_points int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, phone)
);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS telegram text;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS tobacco_preferences text[] NOT NULL DEFAULT '{}';
ALTER TABLE guests ADD COLUMN IF NOT EXISTS bowl_preferences text[] NOT NULL DEFAULT '{}';
ALTER TABLE guests ADD COLUMN IF NOT EXISTS bar_preferences text[] NOT NULL DEFAULT '{}';
ALTER TABLE guests ADD COLUMN IF NOT EXISTS allergies text;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS loyalty_tier text NOT NULL DEFAULT 'base';

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  table_id uuid REFERENCES tables(id),
  guest_id uuid REFERENCES guests(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  guests_count int NOT NULL DEFAULT 1,
  deposit_required numeric(12,2) NOT NULL DEFAULT 0,
  deposit_paid numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  notes text
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  name text NOT NULL,
  category text NOT NULL,
  sale_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  search_aliases text[] NOT NULL DEFAULT '{}'
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_active_name
  ON product_categories (venue_id, lower(name)) WHERE is_active;

CREATE TABLE ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Ингредиенты',
  unit text NOT NULL,
  cost numeric(12,4) NOT NULL DEFAULT 0,
  min_stock numeric(12,3) NOT NULL DEFAULT 0,
  is_marked boolean NOT NULL DEFAULT false
);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Ингредиенты';

CREATE TABLE recipes (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  instructions text
);
CREATE TABLE recipe_items (
  product_id uuid NOT NULL REFERENCES recipes(product_id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (product_id, ingredient_id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  table_id uuid REFERENCES tables(id),
  reservation_id uuid REFERENCES reservations(id),
  guest_id uuid REFERENCES guests(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  status order_status NOT NULL DEFAULT 'open',
  vip_minimum numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  station text,
  status text NOT NULL DEFAULT 'new',
  guest_number int
);

CREATE TABLE discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('percent','fixed')),
  value numeric(12,2) NOT NULL CHECK (value >= 0),
  reason text NOT NULL,
  status discount_status NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  method text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status payment_status NOT NULL DEFAULT 'pending',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order_status ON payments (order_id, status);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  direction stock_direction NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  reason text,
  order_id uuid REFERENCES orders(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric(12,2) NOT NULL DEFAULT 0,
  closing_cash numeric(12,2)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id),
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'disabled',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_table_status ON orders(table_id, status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_stock_ingredient_time ON stock_movements(ingredient_id, created_at);
CREATE INDEX idx_audit_entity_time ON audit_events(entity_type, entity_id, created_at);

-- Операционные индексы для CRM
CREATE INDEX IF NOT EXISTS idx_orders_venue_status ON orders (venue_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_table_open ON orders (table_id, status) WHERE status IN ('open','pending');
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient_time ON stock_movements (ingredient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_venue_time ON audit_events (venue_id, created_at DESC);

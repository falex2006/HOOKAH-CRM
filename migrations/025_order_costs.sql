CREATE TABLE IF NOT EXISTS order_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  cost numeric(12,2) NOT NULL CHECK (cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_costs_venue_created_idx ON order_costs(venue_id, created_at DESC);

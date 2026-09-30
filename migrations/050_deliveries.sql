-- Delivery records belong to a venue and survive application restarts.
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  customer_name text NOT NULL CHECK (char_length(customer_name) BETWEEN 1 AND 120),
  phone text NOT NULL DEFAULT '',
  address text NOT NULL CHECK (char_length(address) BETWEEN 1 AND 500),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','card','qr')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','in_delivery','delivered','cancelled')),
  courier text NOT NULL DEFAULT '' CHECK (char_length(courier) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deliveries_venue_created_idx ON deliveries(venue_id,created_at DESC,id);

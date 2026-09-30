-- Informational tobacco catalog, shared within an organization or local to a venue.
-- It deliberately has no stock, supplier, cost, or movement fields.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='venues_id_organization_unique') THEN
    ALTER TABLE venues ADD CONSTRAINT venues_id_organization_unique UNIQUE (id, organization_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tobacco_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('organization','venue')),
  venue_id uuid,
  brand text NOT NULL,
  product_line text,
  flavor text NOT NULL,
  product_type text NOT NULL DEFAULT 'tobacco' CHECK (product_type IN ('tobacco','tobacco_free')),
  package_grams numeric(10,3) CHECK (package_grams IS NULL OR package_grams > 0),
  strength text,
  country text,
  leaf_type text,
  barcode text,
  aliases text[] NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tobacco_catalog_scope_owner_check CHECK (
    (scope='organization' AND venue_id IS NULL) OR
    (scope='venue' AND venue_id IS NOT NULL)
  ),
  CONSTRAINT tobacco_catalog_venue_organization_fk
    FOREIGN KEY (venue_id, organization_id)
    REFERENCES venues(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT tobacco_catalog_brand_length CHECK (length(btrim(brand)) BETWEEN 1 AND 120),
  CONSTRAINT tobacco_catalog_flavor_length CHECK (length(btrim(flavor)) BETWEEN 1 AND 160),
  CONSTRAINT tobacco_catalog_line_length CHECK (product_line IS NULL OR length(btrim(product_line)) <= 120),
  CONSTRAINT tobacco_catalog_description_length CHECK (length(description) <= 1200)
);

CREATE INDEX IF NOT EXISTS tobacco_catalog_org_active_idx
  ON tobacco_catalog_items (organization_id, is_active, brand, flavor)
  WHERE scope='organization';
CREATE INDEX IF NOT EXISTS tobacco_catalog_venue_active_idx
  ON tobacco_catalog_items (organization_id, venue_id, is_active, brand, flavor)
  WHERE scope='venue';
CREATE INDEX IF NOT EXISTS tobacco_catalog_barcode_idx
  ON tobacco_catalog_items (organization_id, barcode)
  WHERE barcode IS NOT NULL AND is_active=true;

CREATE UNIQUE INDEX IF NOT EXISTS tobacco_catalog_org_variant_unique
  ON tobacco_catalog_items (
    organization_id,
    lower(btrim(brand)),
    lower(btrim(COALESCE(product_line,''))),
    lower(btrim(flavor)),
    product_type,
    COALESCE(package_grams,0)
  ) WHERE scope='organization' AND is_active=true;
CREATE UNIQUE INDEX IF NOT EXISTS tobacco_catalog_venue_variant_unique
  ON tobacco_catalog_items (
    organization_id,
    venue_id,
    lower(btrim(brand)),
    lower(btrim(COALESCE(product_line,''))),
    lower(btrim(flavor)),
    product_type,
    COALESCE(package_grams,0)
  ) WHERE scope='venue' AND is_active=true;

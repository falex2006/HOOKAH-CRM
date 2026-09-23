CREATE TABLE IF NOT EXISTS inventory_departments (
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'coral',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, code),
  UNIQUE (venue_id, name)
);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'inventory';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'ingredient';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS purchase_unit text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS pack_multiplier numeric(12,3) NOT NULL DEFAULT 1 CHECK (pack_multiplier > 0);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS note text;
CREATE INDEX IF NOT EXISTS ingredients_department_idx ON ingredients (venue_id, department, is_marked);
INSERT INTO inventory_departments (venue_id, code, name, description, color, sort_order)
SELECT v.id, seed.code, seed.name, seed.description, seed.color, seed.sort_order
FROM venues v
CROSS JOIN (VALUES
  ('kitchen','Кухня','Продукты, заготовки и блюда','coral',10),
  ('bar','Бар','Напитки, сиропы и чай','amber',20),
  ('hookah','Кальяны','Табак, уголь и расходники','violet',30),
  ('inventory','Хозяйственный склад','Расходники и инвентарь','green',40)
) AS seed(code,name,description,color,sort_order)
ON CONFLICT (venue_id, code) DO NOTHING;

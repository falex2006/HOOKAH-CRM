CREATE OR REPLACE FUNCTION seed_default_inventory_departments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO inventory_departments (venue_id, code, name, description, color, sort_order)
  VALUES
    (NEW.id, 'kitchen', 'Кухня', 'Продукты, заготовки и блюда', 'coral', 10),
    (NEW.id, 'bar', 'Бар', 'Напитки, сиропы и чай', 'amber', 20),
    (NEW.id, 'hookah', 'Кальяны', 'Табак, уголь и расходники', 'violet', 30),
    (NEW.id, 'inventory', 'Хозяйственный склад', 'Расходники и инвентарь', 'green', 40)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_seed_inventory_departments ON venues;
CREATE TRIGGER venues_seed_inventory_departments
AFTER INSERT ON venues
FOR EACH ROW
EXECUTE FUNCTION seed_default_inventory_departments();

INSERT INTO inventory_departments (venue_id, code, name, description, color, sort_order)
SELECT v.id, seed.code, seed.name, seed.description, seed.color, seed.sort_order
FROM venues v
CROSS JOIN (VALUES
  ('kitchen','Кухня','Продукты, заготовки и блюда','coral',10),
  ('bar','Бар','Напитки, сиропы и чай','amber',20),
  ('hookah','Кальяны','Табак, уголь и расходники','violet',30),
  ('inventory','Хозяйственный склад','Расходники и инвентарь','green',40)
) AS seed(code,name,description,color,sort_order)
ON CONFLICT DO NOTHING;

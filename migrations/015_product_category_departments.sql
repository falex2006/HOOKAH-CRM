ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'inventory';
CREATE INDEX IF NOT EXISTS product_categories_department_idx ON product_categories (venue_id, department, is_active);

-- A category may be scoped to one active subdepartment, or remain directly
-- under its department when no subdepartment is required.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_subdepartments_category_parent_uq
  ON inventory_subdepartments (venue_id, id, department_code);

ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS subdepartment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='product_categories_subdepartment_fk'
      AND conrelid='product_categories'::regclass
  ) THEN
    ALTER TABLE product_categories
      ADD CONSTRAINT product_categories_subdepartment_fk
      FOREIGN KEY (venue_id, subdepartment_id, department)
      REFERENCES inventory_subdepartments (venue_id, id, department_code)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_categories_subdepartment_idx
  ON product_categories (venue_id, department, subdepartment_id, is_active);

-- Migrate legacy text-based item assignments only when every item in a
-- category points to the same existing active subdepartment. Ambiguous or
-- partial legacy matches remain department-level for a deliberate user choice.
WITH category_links AS (
  SELECT c.id AS category_id,
         COUNT(i.id) AS total_items,
         COUNT(s.id) AS linked_items,
         COUNT(DISTINCT s.id) AS distinct_subdepartments,
         MIN(s.id::text)::uuid AS subdepartment_id
  FROM product_categories c
  JOIN ingredients i
    ON i.venue_id=c.venue_id
   AND i.department=c.department
   AND lower(btrim(i.category))=lower(btrim(c.name))
   AND i.is_marked=true
  LEFT JOIN inventory_subdepartments s
    ON s.venue_id=i.venue_id
   AND s.department_code=i.department
   AND lower(btrim(s.name))=lower(btrim(i.subdepartment))
   AND s.is_active=true
  WHERE c.is_active=true
  GROUP BY c.id
)
UPDATE product_categories c
SET subdepartment_id=links.subdepartment_id
FROM category_links links
WHERE c.id=links.category_id
  AND links.total_items=links.linked_items
  AND links.distinct_subdepartments=1;

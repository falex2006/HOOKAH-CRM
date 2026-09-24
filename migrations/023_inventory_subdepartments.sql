ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS subdepartment text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS ingredients_hierarchy_idx ON ingredients (venue_id, department, subdepartment, category, is_marked);

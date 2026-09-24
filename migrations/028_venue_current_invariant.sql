-- Keep exactly one active network venue marked as current.
WITH selected AS (
  SELECT id FROM venues
  WHERE is_active = true
  ORDER BY is_current DESC, created_at ASC, id ASC
  LIMIT 1
)
UPDATE venues
SET is_current = (id = (SELECT id FROM selected))
WHERE is_active = true;
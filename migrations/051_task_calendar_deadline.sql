-- Preserve legacy timestamp deadlines; calendar days have separate semantics.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_deadline_single_kind'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_deadline_single_kind
      CHECK (due_date IS NULL OR due_at IS NULL);
  END IF;
END $$;

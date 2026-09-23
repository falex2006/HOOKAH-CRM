-- Keep at most two concurrent sessions per user, identified by device.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS device_id text;
UPDATE auth_sessions SET device_id=gen_random_uuid()::text WHERE device_id IS NULL;
ALTER TABLE auth_sessions ALTER COLUMN device_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE auth_sessions ALTER COLUMN device_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_sessions_user_device ON auth_sessions (user_id, device_id);

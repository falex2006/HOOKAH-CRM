-- Управляющий — отдельная рабочая роль с операционными настройками без доступа к кадровому управлению.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cleaner';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'technician';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'other_staff';

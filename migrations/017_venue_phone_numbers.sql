ALTER TABLE venues ADD COLUMN IF NOT EXISTS phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE venues SET phone_numbers = jsonb_build_array(jsonb_build_object('label','Основной','number',phone,'primary',true)) WHERE phone IS NOT NULL AND phone <> '' AND phone_numbers = '[]'::jsonb;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS expected_cash numeric(12,2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_variance numeric(12,2);

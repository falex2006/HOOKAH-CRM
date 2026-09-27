import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated PostgreSQL test database');
const parsed = new URL(databaseUrl);
assert.match(parsed.pathname, /(?:test|qa|scratch)/i,
  'refusing test writes unless the database name clearly identifies a test/QA/scratch database');

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const client = new Client({ connectionString: databaseUrl });
const schema = `migration_upgrade_qa_${process.pid}_${Date.now()}`;
const quotedSchema = `"${schema}"`;
let transaction = false;

try {
  await client.connect();
  await client.query('BEGIN');
  transaction = true;
  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
  await client.query(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));

  const migrations = fs.readdirSync(path.join(root, 'migrations'))
    .filter((file) => file.endsWith('.sql') && Number(file.slice(0, 3)) <= 38)
    .sort();
  for (const file of migrations) {
    await client.query(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }

  const venue = (await client.query("INSERT INTO venues (name) VALUES ('Legacy migration QA') RETURNING id")).rows[0].id;
  const user = (await client.query(
    "INSERT INTO users (venue_id,full_name,login,role) VALUES ($1,'Legacy QA','legacy-qa-' || gen_random_uuid()::text,'owner') RETURNING id", [venue],
  )).rows[0].id;
  const openShift = (await client.query(
    'INSERT INTO shifts (venue_id,opened_by,opening_cash) VALUES ($1,$2,100) RETURNING id', [venue, user],
  )).rows[0].id;
  const closedShift = (await client.query(
    'INSERT INTO shifts (venue_id,opened_by,closed_at,opening_cash,closing_cash) VALUES ($1,$2,now(),100,125) RETURNING id', [venue, user],
  )).rows[0].id;
  const order = (await client.query(
    'INSERT INTO orders (venue_id,opened_by,closed_at,status) VALUES ($1,$2,now(),\'closed\') RETURNING id', [venue, user],
  )).rows[0].id;
  const oldPayment = (await client.query(
    "INSERT INTO payments (order_id,method,amount,status) VALUES ($1,'cash',25,'paid') RETURNING id", [order],
  )).rows[0].id;
  const rule = (await client.query(
    "INSERT INTO payroll_rules (venue_id,name,rule_type,rate) VALUES ($1,'Legacy hourly','hourly',100) RETURNING id", [venue],
  )).rows[0].id;
  const legacyPayrollIds = (await client.query(
    "INSERT INTO payroll_entries (venue_id,user_id,rule_id,period_from,period_to,amount,status) VALUES ($1,$2,$3,'2026-08-01','2026-08-15',1500,'draft'),($1,$2,$3,'2026-08-16','2026-08-31',1600,'approved') RETURNING id,status,amount",
    [venue, user, rule],
  )).rows;
  const oldExpense = (await client.query(
    "INSERT INTO expenses (venue_id,category,amount,expense_date,source) VALUES ($1,'purchase',250,'2026-08-02','purchase') RETURNING id", [venue],
  )).rows[0].id;
  const oldDocument = (await client.query(
    "INSERT INTO inventory_purchase_documents (venue_id,supplier_name,document_number,document_date,status) VALUES ($1,'Legacy supplier','LEGACY-1','2026-08-01','posted') RETURNING id", [venue],
  )).rows[0].id;

  const latest = fs.readdirSync(path.join(root, 'migrations'))
    .filter((file) => file.endsWith('.sql') && Number(file.slice(0, 3)) >= 39)
    .sort();
  for (const file of latest) {
    await client.query(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }

  const payment = await client.query('SELECT shift_id FROM payments WHERE id=$1', [oldPayment]);
  assert.equal(payment.rows[0].shift_id, null, '039 preserves unknown historical shift attribution rather than guessing');
  assert.equal((await client.query('SELECT id FROM shifts WHERE id=$1 AND closed_at IS NULL', [openShift])).rowCount, 1);
  assert.equal((await client.query('SELECT id FROM shifts WHERE id=$1 AND closed_at IS NOT NULL', [closedShift])).rowCount, 1);
  const payrollAfter = (await client.query('SELECT id,status,amount FROM payroll_entries ORDER BY period_from')).rows;
  assert.deepEqual(payrollAfter, legacyPayrollIds, '040 preserves legacy payroll status and amount');
  assert.equal((await client.query('SELECT id FROM expenses WHERE id=$1 AND source=\'purchase\'', [oldExpense])).rowCount, 1);
  assert.equal((await client.query('SELECT id FROM inventory_purchase_documents WHERE id=$1 AND status=\'posted\'', [oldDocument])).rowCount, 1);

  for (const file of latest) {
    await client.query(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }
  assert.deepEqual((await client.query('SELECT id,status,amount FROM payroll_entries ORDER BY period_from')).rows,
    legacyPayrollIds, 'replaying latest migrations preserves legacy payroll');
  console.log(`MIGRATIONS PG UPGRADE QA: PASS (${migrations.length} baseline migrations + ${latest.length} new migrations; legacy NULL cash attribution and old payroll/expense/receipt records preserved; latest migrations replayed; schema rolled back)`);
} finally {
  if (transaction) await client.query('ROLLBACK').catch(() => {});
  if (client._connected) await client.end();
}

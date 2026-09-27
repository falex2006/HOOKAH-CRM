import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(root, 'migrations', '040_payroll_lifecycle.sql'), 'utf8');
const sql = migration.replace(/^\s*--.*$/gm, '');

assert.match(sql, /ADD COLUMN IF NOT EXISTS approved_at timestamptz/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users\(id\) ON DELETE SET NULL/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS paid_at timestamptz/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users\(id\) ON DELETE SET NULL/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS payment_date date/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS cancelled_at timestamptz/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users\(id\) ON DELETE SET NULL/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS cancellation_reason text/);
assert.match(sql, /DROP CONSTRAINT IF EXISTS payroll_entries_status_check/);
assert.match(sql, /DROP CONSTRAINT IF EXISTS payroll_entries_lifecycle_status_check/);
assert.match(sql, /CHECK \(status IN \('draft','approved','paid','cancelled'\)\)/);
assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE|INSERT)\s+payroll_entries\b/im,
  'migration cannot change or remove existing payroll rows; legacy draft values remain untouched');
assert.doesNotMatch(sql, /^\s*ALTER\s+TABLE\s+payroll_entries\s+DROP\s+COLUMN/im,
  'migration cannot remove existing payroll data');
console.log('PAYROLL LIFECYCLE MIGRATION PREFLIGHT: static safety checks passed (no data backfill or cleanup)');

const testUrl = process.env.PAYROLL_LIFECYCLE_TEST_DATABASE_URL;
if (!testUrl) {
  console.log('PAYROLL LIFECYCLE MIGRATION PREFLIGHT: PostgreSQL execution skipped; set PAYROLL_LIFECYCLE_TEST_DATABASE_URL to an isolated test database');
  process.exit(0);
}

const parsedUrl = new URL(testUrl);
assert.match(parsedUrl.pathname, /(?:test|qa|scratch)/i,
  'refusing to execute DDL unless database name clearly identifies a test/QA/scratch database');
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const client = new Client({ connectionString: testUrl });
const schema = `payroll_lifecycle_qa_${process.pid}_${Date.now()}`;
const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
try {
  await client.connect();
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
  await client.query('CREATE TABLE users (id uuid PRIMARY KEY)');
  await client.query(`CREATE TABLE payroll_entries (
    id uuid PRIMARY KEY, status text NOT NULL, amount numeric(12,2) NOT NULL,
    expense_id uuid, CONSTRAINT payroll_entries_status_check
      CHECK (status IN ('draft','approved','paid'))
  )`);
  const legacyDraftId = '10000000-0000-0000-0000-000000000001';
  const legacyApprovedId = '10000000-0000-0000-0000-000000000002';
  await client.query("INSERT INTO payroll_entries (id,status,amount) VALUES ($1,'draft',1250.50),($2,'approved',2400)", [legacyDraftId, legacyApprovedId]);
  const before = await client.query('SELECT id,status,amount FROM payroll_entries ORDER BY id');
  await client.query(migration);
  await client.query(migration);
  const after = await client.query('SELECT id,status,amount FROM payroll_entries ORDER BY id');
  assert.deepEqual(after.rows, before.rows, 'applying migration twice leaves historical rows, amounts, and statuses unchanged');
  await client.query("INSERT INTO payroll_entries (id,status,amount) VALUES ('10000000-0000-0000-0000-000000000003','cancelled',0)");
  await assert.rejects(client.query("INSERT INTO payroll_entries (id,status,amount) VALUES ('10000000-0000-0000-0000-000000000004','unknown',0)"),
    (error) => error.code === '23514');
  const statusConstraint = await client.query("SELECT COUNT(*)::int AS count FROM pg_constraint WHERE conrelid='payroll_entries'::regclass AND conname='payroll_entries_lifecycle_status_check'");
  assert.equal(statusConstraint.rows[0].count, 1, 'replay leaves one expanded lifecycle status constraint');
  console.log('PAYROLL LIFECYCLE MIGRATION PREFLIGHT: PostgreSQL test-schema replay and row-preservation checks passed');
} finally {
  if (client._connected) {
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`).catch(() => {});
    await client.end();
  }
}

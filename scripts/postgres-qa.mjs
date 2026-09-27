import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to a pre-initialized, isolated PostgreSQL QA database');
const parsedUrl = new URL(databaseUrl);
assert.match(parsedUrl.pathname, /(?:test|qa|scratch)/i,
  'refusing PostgreSQL QA writes unless the database name clearly identifies test/QA/scratch');

const checks = [
  'payroll-lifecycle-migration-preflight.mjs',
  'migrations-pg-upgrade-qa.mjs',
  'migrations-pg-runtime-qa.mjs',
  'migrations-pg-041-recovery-concurrency-qa.mjs',
  'purchase-payment-postgres-api-qa.mjs',
  'payroll-lifecycle-postgres-api-qa.mjs',
  'finance-employee-postgres-qa.mjs',
  'shift-cash-postgres-e2e-qa.mjs',
  'recipe-depletion-pg-runtime-qa.mjs',
];
const env = {
  ...process.env,
  MIGRATIONS_PG_TEST_DATABASE_URL: databaseUrl,
  PAYROLL_LIFECYCLE_TEST_DATABASE_URL: process.env.PAYROLL_LIFECYCLE_TEST_DATABASE_URL || databaseUrl,
  RECIPE_DEPLETION_PG_TEST_DATABASE_URL: process.env.RECIPE_DEPLETION_PG_TEST_DATABASE_URL || databaseUrl,
};

for (const check of checks) {
  console.log(`RUN PostgreSQL QA: ${check}`);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', check)], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    console.error(`POSTGRESQL QA STOPPED: ${check} failed`);
    break;
  }
}

if (!process.exitCode) console.log(`POSTGRESQL QA: PASS (${checks.length} isolated suites)`);

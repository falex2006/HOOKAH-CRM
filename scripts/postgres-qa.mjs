import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertQaDatabaseIdentity, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to a pre-initialized, isolated PostgreSQL QA database');
const databaseTargets = [
  ['MIGRATIONS_PG_TEST_DATABASE_URL', databaseUrl],
  ['PAYROLL_LIFECYCLE_TEST_DATABASE_URL', process.env.PAYROLL_LIFECYCLE_TEST_DATABASE_URL || databaseUrl],
  ['RECIPE_DEPLETION_PG_TEST_DATABASE_URL', process.env.RECIPE_DEPLETION_PG_TEST_DATABASE_URL || databaseUrl],
].map(([label, value]) => ({ label, value, ...validateQaDatabaseUrl(value, label) }));

// Confirm the actual server and role with a read-only query before any test suite can write.
for (const target of databaseTargets) {
  const pool = new Pool({ connectionString: target.value, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
      inet_server_port() AS port, COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false) AS superuser`);
    assertQaDatabaseIdentity(rows[0], target.database, Number(target.url.port || 5432), target.label);
    console.log(`Verified isolated PostgreSQL QA target: ${target.label} (${target.database}, ${rows[0].address}:${rows[0].port})`);
  } finally { await pool.end(); }
}

const checks = [
  'payroll-lifecycle-migration-preflight.mjs',
  'migrations-pg-upgrade-qa.mjs',
  'migrations-pg-runtime-qa.mjs',
  'migrations-pg-041-recovery-concurrency-qa.mjs',
  'venue-inventory-departments-postgres-qa.mjs',
  'purchase-payment-postgres-api-qa.mjs',
  'guest-loyalty-postgres-api-qa.mjs',
  'finance-categories-postgres-api-qa.mjs',
  'payroll-lifecycle-postgres-api-qa.mjs',
  'tasks-postgres-e2e-qa.mjs',
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

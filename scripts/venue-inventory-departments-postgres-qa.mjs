import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertQaDatabaseIdentity, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
const target = validateQaDatabaseUrl(databaseUrl, 'MIGRATIONS_PG_TEST_DATABASE_URL');
const { Client } = createRequire(import.meta.url)('pg');
const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
let venueId;
try {
  await client.connect();
  const identity = (await client.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
    inet_server_port() AS port, COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false) AS superuser`)).rows[0];
  assertQaDatabaseIdentity(identity, target.database, Number(target.url.port || 5432));
  venueId = (await client.query("INSERT INTO venues (name) VALUES ('New venue inventory departments QA') RETURNING id")).rows[0].id;
  const departments = (await client.query('SELECT code,name FROM inventory_departments WHERE venue_id=$1 ORDER BY sort_order', [venueId])).rows;
  assert.deepEqual(departments, [
    { code: 'kitchen', name: 'Кухня' },
    { code: 'bar', name: 'Бар' },
    { code: 'hookah', name: 'Кальяны' },
    { code: 'inventory', name: 'Хозяйственный склад' },
  ], 'every newly created venue receives the default inventory departments');
  console.log('NEW VENUE INVENTORY DEPARTMENTS POSTGRES QA: PASS (venue trigger creates all four standard departments)');
} finally {
  if (venueId) await client.query('DELETE FROM venues WHERE id=$1', [venueId]).catch(() => {});
  await client.end();
}

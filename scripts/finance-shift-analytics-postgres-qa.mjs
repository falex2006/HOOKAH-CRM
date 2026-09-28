import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated PostgreSQL QA database');
assert.match(new URL(databaseUrl).pathname, /(?:test|qa|scratch)/i,
  'refusing writes unless the database name clearly identifies test/QA/scratch');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { validateQaDatabaseUrl, assertQaDatabaseIdentity } = await import('./postgres-qa-safety.mjs');
const { database } = validateQaDatabaseUrl(databaseUrl, 'MIGRATIONS_PG_TEST_DATABASE_URL');
const client = new Client({ connectionString: databaseUrl });
const venueId = randomUUID();
const ownerId = randomUUID();
const productOrderAmounts = [100, 100, 900];
const splitOrderId = randomUUID();
let server;
let serverExitPromise;
let output = '';
let baseUrl = '';

const request = async (route) => {
  const response = await fetch(`${baseUrl}${route}`);
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${route} responds successfully: ${JSON.stringify(payload)}`);
  return payload;
};

try {
  await client.connect();
  const identity = await client.query(`SELECT current_database() AS database,
    inet_server_addr()::text AS address, inet_server_port() AS port,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser`);
  assertQaDatabaseIdentity(identity.rows[0], database, Number(new URL(databaseUrl).port || 5432),
    'Finance shift/analytics QA database');
  await client.query("INSERT INTO venues (id,name,timezone) VALUES ($1,'Finance shift/median QA','Asia/Yekaterinburg')", [venueId]);
  await client.query("INSERT INTO users (id,venue_id,full_name,login,role) VALUES ($1::uuid,$2::uuid,'Finance QA','finance-shift-qa-' || $1::text,'owner')", [ownerId, venueId]);
  const shiftA = (await client.query(`INSERT INTO shifts (venue_id,opened_by,opened_at,closed_at,opening_cash)
    VALUES ($1,$2,now()-INTERVAL '2 hours',now()-INTERVAL '30 minutes',0) RETURNING id`, [venueId, ownerId])).rows[0].id;
  const shiftB = (await client.query(`INSERT INTO shifts (venue_id,opened_by,opened_at,opening_cash)
    VALUES ($1,$2,now()-INTERVAL '20 minutes',0) RETURNING id`, [venueId, ownerId])).rows[0].id;

  for (const amount of productOrderAmounts) {
    const orderId = randomUUID();
    await client.query(`INSERT INTO orders (id,venue_id,opened_by,status,closed_at,closed_in_shift_id)
      VALUES ($1,$2,$3,'closed',now(),$4)`, [orderId, venueId, ownerId, shiftA]);
    await client.query(`INSERT INTO payments (order_id,method,amount,status,shift_id)
      VALUES ($1,'cash',$2,'paid',$3)`, [orderId, amount, shiftA]);
  }

  await client.query(`INSERT INTO orders (id,venue_id,opened_by,status,closed_at,closed_in_shift_id)
    VALUES ($1,$2,$3,'closed',now(),$4)`, [splitOrderId, venueId, ownerId, shiftB]);
  await client.query(`INSERT INTO payments (order_id,method,amount,status,shift_id)
    VALUES ($1,'cash',100,'partially_paid',$2),($1,'cash',200,'paid',$3)`, [splitOrderId, shiftA, shiftB]);

  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      HOST: '127.0.0.1', PORT: '0', DATABASE_URL: databaseUrl, VENUE_ID: venueId,
      AUTH_REQUIRED: 'false', COOKIE_SECURE: 'false', NODE_ENV: 'test', API_RATE_LIMIT: '5000',
      PGOPTIONS: '-c timezone=UTC',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverExitPromise = new Promise((resolve) => server.once('exit', resolve));
  server.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const until = Date.now() + 20000;
  while (!baseUrl && Date.now() < until) {
    const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) baseUrl = `http://127.0.0.1:${match[1]}`;
    else if (server.exitCode !== null) throw new Error(`isolated PostgreSQL API failed to start: ${output}`);
    else await delay(50);
  }
  assert.ok(baseUrl, `isolated PostgreSQL API starts: ${output}`);

  const summary = await request('/api/finance/summary');
  assert.equal(summary.currentShiftOrders, 1, 'the current-shift denominator is tied to closed_in_shift_id');
  assert.equal(summary.currentShiftAverageCheck, 300,
    'the average check for an order closed in shift B includes both payments made across shifts');

  const analytics = await request('/api/analytics?days=7');
  assert.equal(analytics.totalRevenue, 1400, 'period turnover includes every paid payment exactly once');
  assert.equal(analytics.averageCheck, 350, 'average check remains the arithmetic mean');
  assert.equal(analytics.medianCheck, 200, 'the period median is calculated from the four individual checks');
  const businessToday = analytics.days.find((day) => day.orders === 4);
  assert.ok(businessToday, 'the fixture orders are grouped under the venue-local business date');
  assert.equal(businessToday.medianCheck, 200, 'daily median is calculated from individual orders too');

  console.log('FINANCE SHIFT/ANALYTICS POSTGRES QA: PASS (split payment is attributed to its payment shift; the full 300 ₽ closed check is counted once for shift B; average 350 and true median 200 at period and day levels)');
} finally {
  if (server && server.exitCode === null && server.signalCode === null) server.kill();
  if (serverExitPromise && server?.exitCode === null && server?.signalCode === null) await serverExitPromise;
  if (client._connected) {
    await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]).catch(() => {});
    await client.query('DELETE FROM orders WHERE venue_id=$1', [venueId]).catch(() => {});
    await client.query('DELETE FROM shifts WHERE venue_id=$1', [venueId]).catch(() => {});
    await client.query('DELETE FROM users WHERE venue_id=$1', [venueId]).catch(() => {});
    await client.query('DELETE FROM venues WHERE id=$1', [venueId]).catch(() => {});
    await client.end();
  }
}

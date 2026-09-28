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
const productIds = [];
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

  const barProductId = randomUUID(); const hookahProductId = randomUUID(); productIds.push(barProductId, hookahProductId);
  await client.query(`INSERT INTO products (id,venue_id,name,category,sale_price)
    VALUES ($1,$3,'QA лимонад','bar',200),($2,$3,'QA кальян','hookah',300)`, [barProductId, hookahProductId, venueId]);

  for (const amount of productOrderAmounts) {
    const orderId = randomUUID();
    await client.query(`INSERT INTO orders (id,venue_id,opened_by,status,closed_at,closed_in_shift_id)
      VALUES ($1,$2,$3,'closed',now(),$4)`, [orderId, venueId, ownerId, shiftA]);
    await client.query(`INSERT INTO payments (order_id,method,amount,status,shift_id)
      VALUES ($1,'cash',$2,'paid',$3)`, [orderId, amount, shiftA]);
    await client.query(`INSERT INTO order_items (order_id,product_id,quantity,unit_price,station)
      VALUES ($1,$2,1,$3,'bar')`, [orderId, barProductId, amount]);
  }

  await client.query(`INSERT INTO orders (id,venue_id,opened_by,status,closed_at,closed_in_shift_id)
    VALUES ($1,$2,$3,'closed',now(),$4)`, [splitOrderId, venueId, ownerId, shiftB]);
  await client.query(`INSERT INTO payments (order_id,method,amount,status,shift_id)
    VALUES ($1,'cash',100,'partially_paid',$2),($1,'cash',200,'paid',$3)`, [splitOrderId, shiftA, shiftB]);
  await client.query(`INSERT INTO order_items (order_id,product_id,quantity,unit_price,station)
    VALUES ($1,$2,1,200,'bar'),($1,$3,1,300,'hookah')`, [splitOrderId, barProductId, hookahProductId]);
  await client.query(`INSERT INTO discounts (order_id,requested_by,approved_by,type,value,reason,status)
    VALUES ($1,$2,$2,'fixed',200,'Finance report allocation QA','approved')`, [splitOrderId, ownerId]);

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
  assert.equal(analytics.byStation.bar.revenue, 1220, 'undiscounted bar sales plus the approved discount allocation reconcile');
  assert.equal(analytics.byStation.hookah.revenue, 180, 'the approved fixed discount is allocated proportionally to the hookah line');
  assert.equal(Object.values(analytics.byStation).reduce((sum, row) => sum + row.revenue, 0), 1400,
    'station breakdown reconciles exactly to all collected revenue');
  const staff = analytics.staffSales.find((row) => row.name === 'Finance QA');
  assert.equal(staff.revenue, 1400, 'staff total equals actual collected revenue for the period');
  assert.equal(staff.items.reduce((sum, row) => sum + row.revenue, 0), 1400,
    'employee product lines allocate the discounted amount and reconcile to collected revenue');
  const report = await request('/api/finance/report?type=waiter');
  assert.equal(report.revenue, 1400, 'daily report uses collected payments as its revenue total');
  assert.equal(report.byStation.bar, 1220);
  assert.equal(report.byStation.hookah, 180);
  assert.equal(report.byStaff['Finance QA'], 1400, 'waiter breakdown matches the report total');

  // A 100%-discounted closed check has no payment row. The report must derive
  // its zero total from persisted order items and the approved discount rather
  // than treating a missing payment as gross revenue.
  const zeroOrderId = randomUUID(); const zeroProductId = randomUUID(); productIds.push(zeroProductId);
  await client.query(`INSERT INTO products (id,venue_id,name,category,sale_price)
    VALUES ($1,$2,'QA zero-paid check','bar',500)`, [zeroProductId, venueId]);
  await client.query(`INSERT INTO orders (id,venue_id,opened_by,status,closed_at,closed_in_shift_id)
    VALUES ($1,$2,$3,'closed',now(),$4)`, [zeroOrderId, venueId, ownerId, shiftA]);
  await client.query(`INSERT INTO order_items (order_id,product_id,quantity,unit_price,station)
    VALUES ($1,$2,1,500,'bar')`, [zeroOrderId, zeroProductId]);
  await client.query(`INSERT INTO discounts (order_id,requested_by,approved_by,type,value,reason,status)
    VALUES ($1,$2,$2,'percent',100,'Finance zero-total regression QA','approved')`, [zeroOrderId, ownerId]);
  const zeroTotalReport = await request('/api/finance/report?type=waiter');
  assert.equal(zeroTotalReport.revenue, 1400, 'an unpaid 100%-discounted order contributes zero report revenue');
  assert.equal(zeroTotalReport.byStaff['Finance QA'], 1400, 'zero-total order does not inflate waiter revenue');
  const zeroTotalSummary = await request('/api/finance/summary');
  assert.equal(zeroTotalSummary.revenue, 1400, 'summary remains based on collected payments');

  console.log('FINANCE SHIFT/ANALYTICS POSTGRES QA: PASS (split shift attribution, true check median, fixed-discount allocation reconciles station/product/staff breakdowns, 100%-discounted zero-paid order stays at zero)');
} finally {
  if (server && server.exitCode === null && server.signalCode === null) server.kill();
  if (serverExitPromise && server?.exitCode === null && server?.signalCode === null) await serverExitPromise;
  if (client._connected) {
    await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]).catch(() => {});
    await client.query('DELETE FROM discounts WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]).catch(() => {});
    await client.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]).catch(() => {});
    await client.query('DELETE FROM orders WHERE venue_id=$1', [venueId]).catch(() => {});
    if (productIds.length) await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [productIds]).catch(() => {});
    await client.query('DELETE FROM shifts WHERE venue_id=$1', [venueId]).catch(() => {});
    await client.query('DELETE FROM users WHERE venue_id=$1', [venueId]).catch(() => {});
    await client.query('DELETE FROM venues WHERE id=$1', [venueId]).catch(() => {});
    await client.end();
  }
}

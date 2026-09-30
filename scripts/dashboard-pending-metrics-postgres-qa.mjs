import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQaDatabaseUrl, assertQaDatabaseIdentity } from './postgres-qa-safety.mjs';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
const { database } = validateQaDatabaseUrl(databaseUrl, 'MIGRATIONS_PG_TEST_DATABASE_URL');
const { Client } = createRequire(import.meta.url)('pg');
const client = new Client({ connectionString: databaseUrl });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venueId = randomUUID();
const ownerId = randomUUID();
const productId = randomUUID();
const overpaidId = randomUUID();
const unpaidId = randomUUID();
const discountedId = randomUUID();
let server, serverExit, output = '', base = '';

const read = async (route) => {
  const response = await fetch(`${base}${route}`);
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`);
  return body;
};

try {
  await client.connect();
  const identity = await client.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
    inet_server_port() AS port, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser`);
  assertQaDatabaseIdentity(identity.rows[0], database, Number(new URL(databaseUrl).port || 5432), 'Dashboard pending metrics QA database');
  await client.query("INSERT INTO venues (id,name,timezone) VALUES ($1,'Dashboard pending QA','Asia/Yekaterinburg')", [venueId]);
  await client.query("INSERT INTO users (id,venue_id,full_name,login,role) VALUES ($1::uuid,$2::uuid,'Pending QA','pending-qa-' || $1::text,'owner')", [ownerId, venueId]);
  await client.query("INSERT INTO products (id,venue_id,name,category,sale_price,inventory_mode) VALUES ($1,$2,'QA service','bar',100,'non_stock')", [productId, venueId]);
  await client.query("INSERT INTO orders (id,venue_id,opened_by,status) VALUES ($1,$3,$4,'open'),($2,$3,$4,'open')", [overpaidId, unpaidId, venueId, ownerId]);
  await client.query("INSERT INTO order_items (order_id,product_id,quantity,unit_price,station) VALUES ($1,$3,1,100,'bar'),($2,$3,1,80,'bar')", [overpaidId, unpaidId, productId]);
  // This legacy/imported payment deliberately exceeds its order's due amount; the public API rejects new overpayments.
  await client.query("INSERT INTO payments (order_id,method,amount,status) VALUES ($1,'cash',150,'paid')", [overpaidId]);

  server = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: databaseUrl, VENUE_ID: venueId,
      AUTH_REQUIRED: 'false', COOKIE_SECURE: 'false', NODE_ENV: 'test', API_RATE_LIMIT: '5000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  serverExit = new Promise((resolve) => server.once('exit', resolve));
  server.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const deadline = Date.now() + 20000;
  while (!base && Date.now() < deadline) {
    const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) base = `http://127.0.0.1:${match[1]}`;
    else if (server.exitCode !== null) throw new Error(`QA server exited: ${output}`);
    else await delay(50);
  }
  assert.ok(base, `QA server started: ${output}`);
  assert.equal((await read('/api/health')).database, 'postgres');
  const finance = await read('/api/finance/summary');
  const metrics = await read('/api/metrics');
  assert.equal(finance.pendingOrders, 2);
  assert.equal(metrics.openOrders, 2);
  assert.equal(Number(finance.pendingRevenue), 80, 'finance summary sums nonnegative unpaid balances per order');
  assert.equal(Number(metrics.pendingRevenue), 80, 'dashboard metrics match finance summary despite another order overpayment');
  await client.query("INSERT INTO orders (id,venue_id,opened_by,status) VALUES ($1,$2,$3,'open')", [discountedId, venueId, ownerId]);
  await client.query("INSERT INTO order_items (order_id,product_id,quantity,unit_price,station) VALUES ($1,$2,1,100,'bar')", [discountedId, productId]);
  await client.query("INSERT INTO payments (order_id,method,amount,status) VALUES ($1,'cash',100,'paid')", [discountedId]);
  await client.query("INSERT INTO discounts (order_id,requested_by,approved_by,type,value,reason,status) VALUES ($1,$2,$2,'percent',20,'QA legacy discount','approved')", [discountedId, ownerId]);
  const discountedFinance = await read('/api/finance/summary');
  const discountedMetrics = await read('/api/metrics');
  assert.equal(discountedFinance.pendingOrders, 3);
  assert.equal(discountedMetrics.openOrders, 3);
  assert.equal(Number(discountedFinance.pendingRevenue), 80, 'approved discount does not create a negative total in finance summary');
  assert.equal(Number(discountedMetrics.pendingRevenue), 80, 'approved discount overpayment does not offset another order');
  console.log('DASHBOARD PENDING METRICS POSTGRES QA: PASS (overpayment and approved discount parity, isolated fixture cleanup)');
} finally {
  if (server && server.exitCode === null && server.signalCode === null) server.kill();
  if (serverExit && server?.exitCode === null && server?.signalCode === null) {
    await Promise.race([serverExit, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await Promise.race([serverExit, delay(3000)]);
  }
  if (client._connected) {
    const cleanupErrors = [];
    for (const [query, params] of [
      ['DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM discounts WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM orders WHERE venue_id=$1', [venueId]],
      ['DELETE FROM products WHERE id=$1', [productId]],
      ['DELETE FROM audit_events WHERE venue_id=$1', [venueId]],
      ['DELETE FROM users WHERE venue_id=$1', [venueId]],
      ['DELETE FROM venues WHERE id=$1', [venueId]],
    ]) try { await client.query(query, params); } catch (error) { cleanupErrors.push(error); }
    const residue = (await client.query('SELECT count(*)::int AS count FROM venues WHERE id=$1', [venueId])).rows[0].count;
    await client.end();
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'QA fixture cleanup failed');
    assert.equal(residue, 0, 'QA venue and child rows removed');
  }
}

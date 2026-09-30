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
const orderId = randomUUID();
const itemA = randomUUID();
let server;
let serverExitPromise;
let output = '';
let base = '';
let passed = false;

const api = async (route, method = 'GET', data, expected = 200) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
  return payload;
};

try {
  await client.connect();
  const identity = await client.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
    inet_server_port() AS port, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser`);
  assertQaDatabaseIdentity(identity.rows[0], database, Number(new URL(databaseUrl).port || 5432), 'Paid-order QA database');
  await client.query("INSERT INTO venues (id,name,timezone) VALUES ($1,'Paid order QA','Asia/Yekaterinburg')", [venueId]);
  await client.query("INSERT INTO users (id,venue_id,full_name,login,role) VALUES ($1::uuid,$2::uuid,'Paid order QA','paid-order-qa-' || $1::text,'owner')", [ownerId, venueId]);
  await client.query("INSERT INTO shifts (venue_id,opened_by,opening_cash) VALUES ($1,$2,0)", [venueId, ownerId]);
  await client.query("INSERT INTO products (id,venue_id,name,category,sale_price,inventory_mode) VALUES ($1,$2,'QA service','bar',100,'non_stock')", [productId, venueId]);
  await client.query("INSERT INTO orders (id,venue_id,opened_by,status) VALUES ($1,$2,$3,'open')", [orderId, venueId, ownerId]);
  await client.query("INSERT INTO order_items (id,order_id,product_id,quantity,unit_price,station) VALUES ($1,$2,$3,2,100,'bar')", [itemA, orderId, productId]);

  server = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: databaseUrl, VENUE_ID: venueId,
      AUTH_REQUIRED: 'false', COOKIE_SECURE: 'false', NODE_ENV: 'test', API_RATE_LIMIT: '5000' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  serverExitPromise = new Promise((resolve) => server.once('exit', resolve));
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
  assert.equal((await api('/api/health')).database, 'postgres');
  assert.equal((await api(`/api/orders/${orderId}/payments`)).due, 200);
  const paid = await api(`/api/orders/${orderId}/payments`, 'POST', { amount: 150, method: 'cash' }, 201);
  assert.equal(paid.remaining, 50);
  assert.equal(paid.closed, false);
  const edit = await api(`/api/orders/${orderId}/items/${itemA}`, 'PATCH', { quantity: 1 }, 409);
  assert.equal(edit.error, 'paid_order_total_conflict');
  assert.equal((await api(`/api/orders/${orderId}/items/${itemA}`, 'DELETE', undefined, 409)).error, 'paid_order_total_conflict');
  assert.equal((await api(`/api/orders/${orderId}/split`, 'POST', { itemIds: [itemA] }, 409)).error, 'paid_order_total_conflict');
  assert.equal((await api(`/api/orders/${orderId}/status`, 'POST', { status: 'cancelled' }, 409)).error, 'paid_order_cannot_cancel');
  assert.equal((await api(`/api/orders/${orderId}`, 'DELETE', { comment: 'QA', writeoff: false }, 409)).error, 'paid_order_cannot_cancel');
  const discountId = randomUUID();
  await client.query("INSERT INTO discounts (id,order_id,requested_by,type,value,reason,status) VALUES ($1,$2,$3,'percent',50,'QA paid conflict','requested')", [discountId, orderId, ownerId]);
  const conflict = await api(`/api/discount-requests/${discountId}/approve`, 'POST', {}, 409);
  assert.equal(conflict.error, 'paid_order_total_conflict');
  assert.equal(conflict.paid, 150);
  assert.equal(conflict.due, 100);
  assert.equal((await client.query('SELECT status FROM discounts WHERE id=$1', [discountId])).rows[0].status, 'requested', 'failed decision rolled back');
  assert.equal((await api(`/api/orders/${orderId}/payments`)).due, 200, 'all failed mutations preserve bill');
  const persistedBeforeClose = await client.query('SELECT status FROM orders WHERE id=$1', [orderId]);
  assert.equal(persistedBeforeClose.rows[0].status, 'open', 'cancel/delete/split did not change the source order');
  const persistedItems = await client.query('SELECT order_id,quantity FROM order_items WHERE id=$1', [itemA]);
  assert.equal(persistedItems.rowCount, 1);
  assert.equal(persistedItems.rows[0].order_id, orderId);
  assert.equal(Number(persistedItems.rows[0].quantity), 2, 'edit, delete and split rolled back');
  assert.equal((await client.query('SELECT count(*)::int AS count FROM orders WHERE venue_id=$1', [venueId])).rows[0].count, 1, 'failed split created no target order');
  assert.equal((await api(`/api/orders/${orderId}/payments`, 'POST', { amount: 50.01, method: 'card' }, 409)).error, 'payment_exceeds_due');
  const final = await api(`/api/orders/${orderId}/payments`, 'POST', { amount: 50, method: 'card' }, 201);
  assert.equal(final.closed, true);
  assert.equal(final.paid, 200);
  assert.equal((await client.query('SELECT status FROM orders WHERE id=$1', [orderId])).rows[0].status, 'closed');
  const persistedPayments = await client.query('SELECT amount FROM payments WHERE order_id=$1 ORDER BY created_at', [orderId]);
  assert.deepEqual(persistedPayments.rows.map((row) => Number(row.amount)).sort((a, b) => a - b), [50, 150], 'exactly two payments persisted');
  passed = true;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) server.kill();
  if (serverExitPromise && server?.exitCode === null && server?.signalCode === null) {
    await Promise.race([serverExitPromise, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await Promise.race([serverExitPromise, delay(3000)]);
  }
  if (client._connected) {
    const cleanupErrors = [];
    for (const [query, params] of [
      ['DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM discounts WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM order_costs WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]],
      ['DELETE FROM orders WHERE venue_id=$1', [venueId]],
      ['DELETE FROM products WHERE id=$1', [productId]],
      ['DELETE FROM shifts WHERE venue_id=$1', [venueId]],
      ['DELETE FROM audit_events WHERE venue_id=$1', [venueId]],
      ['DELETE FROM users WHERE venue_id=$1', [venueId]],
      ['DELETE FROM venues WHERE id=$1', [venueId]],
    ]) {
      try { await client.query(query, params); } catch (error) { cleanupErrors.push(error); }
    }
    const residue = (await client.query('SELECT count(*)::int AS count FROM venues WHERE id=$1', [venueId])).rows[0].count;
    await client.end();
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'QA fixture cleanup failed');
    assert.equal(residue, 0, 'QA venue and child records were removed');
  }
}
if (passed) console.log('PAID ORDER BALANCE POSTGRES QA: PASS (HTTP transactions, rollback, exact balance, close, cleanup)');

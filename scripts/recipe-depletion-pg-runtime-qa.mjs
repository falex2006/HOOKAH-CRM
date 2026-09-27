import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.RECIPE_DEPLETION_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set RECIPE_DEPLETION_PG_TEST_DATABASE_URL to an isolated PostgreSQL QA database');
const parsedUrl = new URL(databaseUrl);
assert.match(parsedUrl.pathname, /(?:test|qa|scratch)/i,
  'refusing writes unless the database name clearly identifies a test/QA/scratch database');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const venueId = randomUUID();
const actorId = '20000000-0000-0000-0000-000000000001';
const zoneId = randomUUID();
const tableId = randomUUID();
const failureFunction = 'qa_recipe_order_close_failure';
const failureTrigger = 'qa_recipe_order_close_failure';
const client = new Client({ connectionString: databaseUrl });
let server;
let serverOutput = '';
let checks = 0;

async function req(base, url, method = 'GET', data, expected = 200) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(result)}`);
  checks++;
  return result;
}

async function getBalance(ingredientId) {
  const result = await client.query(`SELECT COALESCE(SUM(CASE
    WHEN direction IN ('in','transfer','adjustment') THEN quantity
    WHEN direction IN ('out','waste') THEN -quantity ELSE 0 END),0)::numeric AS balance
    FROM stock_movements WHERE venue_id=$1 AND ingredient_id=$2`, [venueId, ingredientId]);
  return Number(result.rows[0].balance);
}

async function getOrderCost(orderId) {
  const result = await client.query('SELECT cost FROM order_costs WHERE venue_id=$1 AND order_id=$2', [venueId, orderId]);
  return result.rows[0] ? Number(result.rows[0].cost) : null;
}

async function cleanSyntheticVenue(id) {
  await client.query(`DROP TRIGGER IF EXISTS ${failureTrigger} ON orders`).catch(() => {});
  await client.query(`DROP FUNCTION IF EXISTS public.${failureFunction}()`).catch(() => {});
  await client.query('DELETE FROM audit_events WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [id]);
  await client.query('DELETE FROM order_costs WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM discounts WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [id]);
  await client.query('DELETE FROM stock_movements WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM orders WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM shifts WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM inventory_recipe_cards WHERE venue_id=$1', [id]).catch(() => {});
  await client.query('DELETE FROM ingredients WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM products WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM zones WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM inventory_departments WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM users WHERE venue_id=$1', [id]);
  await client.query('DELETE FROM venues WHERE id=$1', [id]);
}

try {
  await client.connect();
  const existingActor = await client.query(`SELECT u.venue_id AS "venueId",u.full_name AS name,v.name AS "venueName"
    FROM users u LEFT JOIN venues v ON v.id=u.venue_id WHERE u.id=$1`, [actorId]);
  if (existingActor.rows[0]) {
    assert.equal(existingActor.rows[0].name, 'QA Владелец', 'reserved fallback actor belongs to this QA script');
    assert.equal(existingActor.rows[0].venueName, 'Синтетическая QA-точка', 'reserved fixture venue belongs to this QA script');
    await cleanSyntheticVenue(existingActor.rows[0].venueId);
  }
  assert.equal((await client.query('SELECT id FROM users WHERE id=$1', [actorId])).rowCount, 0,
    'no synthetic fallback actor remains after fixture cleanup');
  await client.query('INSERT INTO venues (id,name,timezone) VALUES ($1,$2,$3)', [venueId, 'Синтетическая QA-точка', 'Asia/Yekaterinburg']);
  await client.query('INSERT INTO users (id,venue_id,full_name,login,role) VALUES ($1,$2,$3,$4,$5)', [actorId, venueId, 'QA Владелец', `qa-${venueId}`, 'owner']);
  await client.query('INSERT INTO inventory_departments (venue_id,code,name) VALUES ($1,$2,$3)', [venueId, 'bar', 'Бар']);
  await client.query('INSERT INTO zones (id,venue_id,name) VALUES ($1,$2,$3)', [zoneId, venueId, 'QA зона']);
  await client.query('INSERT INTO tables (id,zone_id,name,capacity,status) VALUES ($1,$2,$3,2,$4)', [tableId, zoneId, 'QA стол', 'free']);

  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      DATABASE_URL: databaseUrl,
      VENUE_ID: venueId,
      AUTH_REQUIRED: 'false',
      NODE_ENV: 'test',
      API_RATE_LIMIT: '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let base;
  const until = Date.now() + 20000;
  while (!base && Date.now() < until) {
    const match = serverOutput.match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) base = `http://127.0.0.1:${match[1]}`;
    else if (server.exitCode !== null) throw new Error(`QA API server exited early: ${serverOutput}`);
    else await delay(50);
  }
  assert.ok(base, `isolated PostgreSQL API server starts: ${serverOutput}`);

  const health = await req(base, '/api/health');
  assert.equal(health.database, 'postgres', 'test exercises the actual PostgreSQL repository path'); checks++;
  await req(base, '/api/shifts', 'POST', { openingCash: 100 }, 201);

  const stockItem = await req(base, '/api/inventory/items', 'POST', {
    name: 'QA сироп для продажи', unit: 'мл', itemType: 'ingredient', cost: 0, department: 'bar',
  }, 201);
  const receipt = await req(base, '/api/inventory/supplies', 'POST', {
    itemId: stockItem.id, quantity: 3, unit: 'л', unitCost: 20, supplier: 'Synthetic QA supplier',
  }, 201);
  assert.equal(Number(receipt.onHandAfter), 3000); assert.equal(Number(receipt.weightedCost), 0.02); checks += 2;

  const product = await req(base, '/api/products', 'POST', {
    name: `QA напиток ${venueId.slice(0, 8)}`, category: 'Бар', price: 150,
  }, 201);
  const recipe = await req(base, '/api/recipes', 'POST', {
    productId: product.id,
    name: product.name,
    ingredients: [{ ingredientId: stockItem.id, name: stockItem.name, quantity: '1 л' }],
    yieldQuantity: 1,
    yieldUnit: 'порция',
    portionCount: 1,
  }, 201);
  assert.equal(recipe.productId, product.id); checks++;

  async function createOrder() {
    const order = await req(base, '/api/orders', 'POST', { tableId }, 201);
    await req(base, `/api/orders/${order.id}/items`, 'POST', { productId: product.id, quantity: 1 }, 201);
    return order.id;
  }

  const firstOrderId = await createOrder();
  const firstClose = await req(base, `/api/orders/${firstOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 200);
  assert.equal(firstClose.status, 'closed');
  assert.equal(await getOrderCost(firstOrderId), 20, '1 l at the received 20 RUB/l costs 20 RUB and is persisted as COGS'); checks += 2;
  assert.equal(await getBalance(stockItem.id), 2000, 'sale subtracts 1000 ml from the real PostgreSQL ledger'); checks++;

  const failedOrderId = await createOrder();
  await client.query(`CREATE FUNCTION public.${failureFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id = '${failedOrderId}'::uuid AND NEW.status='closed' THEN
        RAISE EXCEPTION 'qa_injected_close_failure';
      END IF;
      RETURN NEW;
    END;
  $$`);
  await client.query(`CREATE TRIGGER ${failureTrigger} BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION public.${failureFunction}()`);
  const rejectedClose = await req(base, `/api/orders/${failedOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 409);
  assert.equal(rejectedClose.error, 'order_close_failed'); checks++;
  assert.equal(await getBalance(stockItem.id), 2000, 'failure after recipe depletion rolls back the stock movement'); checks++;
  const afterInjectedFailure = await client.query(`SELECT o.status,
      (SELECT count(*)::int FROM payments p WHERE p.order_id=o.id) AS payments,
      (SELECT count(*)::int FROM order_costs c WHERE c.order_id=o.id) AS cogs
    FROM orders o WHERE o.id=$1`, [failedOrderId]);
  assert.deepEqual(afterInjectedFailure.rows[0], { status: 'open', payments: 0, cogs: 0 }, 'failed close leaves order, payments and COGS unchanged'); checks++;
  await client.query(`DROP TRIGGER ${failureTrigger} ON orders`);
  await client.query(`DROP FUNCTION public.${failureFunction}()`);

  await req(base, '/api/inventory/supplies', 'POST', {
    itemId: stockItem.id, quantity: 1, unit: 'л', unitCost: 100, supplier: 'Synthetic QA price change',
  }, 201);
  assert.equal(Number((await client.query('SELECT cost FROM ingredients WHERE id=$1', [stockItem.id])).rows[0].cost), 0.05,
    'weighted average purchase cost rounds to the currency precision'); checks++;
  const retryClose = await req(base, `/api/orders/${failedOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 200);
  assert.equal(retryClose.status, 'closed');
  assert.equal(await getOrderCost(failedOrderId), 50, 'retry uses the current weighted ingredient cost and stores COGS'); checks += 2;
  assert.equal(await getBalance(stockItem.id), 2000, 'retry depletes exactly one portion, not the failed attempt plus retry'); checks++;
  const duplicateClose = await req(base, `/api/orders/${failedOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 409);
  assert.equal(duplicateClose.error, 'order_already_final'); checks++;
  assert.equal(await getBalance(stockItem.id), 2000, 'duplicate close cannot deplete inventory again'); checks++;

  const snapshots = await client.query('SELECT cost FROM order_costs WHERE order_id=$1', [firstOrderId]);
  assert.equal(Number(snapshots.rows[0].cost), 20, 'historical COGS snapshot is unchanged after a later purchase changes weighted cost'); checks++;
  const paymentRows = await client.query('SELECT amount,status,shift_id FROM payments WHERE order_id=$1', [failedOrderId]);
  assert.equal(paymentRows.rowCount, 1);
  assert.equal(Number(paymentRows.rows[0].amount), 150);
  assert.equal(paymentRows.rows[0].status, 'paid');
  assert.ok(paymentRows.rows[0].shift_id, 'sale payment retains shift attribution'); checks += 4;
  const activeShift = await client.query('SELECT id FROM shifts WHERE venue_id=$1 AND closed_at IS NULL', [venueId]);
  assert.equal(activeShift.rowCount, 1, 'sale flow retains one active shift for later cash reconciliation'); checks++;

  console.log(`RECIPE DEPLETION POSTGRES API QA: PASS (${checks} assertions; receipts→stock→recipe→sale→atomic rollback/retry→COGS/payment snapshot; all data is synthetic)`);
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise((resolve) => server.once('exit', resolve)), delay(3000)]);
  }
  if (client._connected) {
    await cleanSyntheticVenue(venueId).catch(() => {});
    await client.end();
  }
}

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
const processTimezone = 'Etc/GMT+12';
const venueTimezone = 'Pacific/Kiritimati';
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

async function getBusinessDate() {
  const result = await client.query(`SELECT COALESCE(NULLIF(v.timezone,''),NULLIF(org.timezone,''),'Asia/Yekaterinburg') AS timezone
    FROM venues v LEFT JOIN organizations org ON org.id=v.organization_id WHERE v.id=$1`, [venueId]);
  const timezone = result.rows[0]?.timezone || 'Asia/Yekaterinburg';
  const date = await client.query('SELECT (now() AT TIME ZONE $1)::date::text AS date', [timezone]);
  return date.rows[0].date;
}

async function cleanSyntheticVenue(id) {
  await client.query(`DROP TRIGGER IF EXISTS ${failureTrigger} ON orders`).catch(() => {});
  await client.query(`DROP FUNCTION IF EXISTS public.${failureFunction}()`).catch(() => {});
  await client.query('BEGIN');
  try {
    // Posted purchase documents are immutable through the product workflow.
    // For this isolated synthetic-fixture teardown only, disable those two
    // business guards in-transaction while keeping all foreign keys enabled.
    await client.query('ALTER TABLE inventory_purchase_document_lines DISABLE TRIGGER inventory_purchase_line_lifecycle_guard');
    await client.query('ALTER TABLE inventory_purchase_documents DISABLE TRIGGER inventory_purchase_document_delete_guard');
    await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [id]);
    await client.query('DELETE FROM discounts WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [id]);
    await client.query('DELETE FROM payroll_entries WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM expenses WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_purchase_document_lines WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_premix_batches WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_recipe_cards WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_purchase_documents WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_auto_orders WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_subdepartments WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM tasks WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM staff_schedules WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM staff_work_logs WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM payroll_rules WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM audit_events WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM integration_events WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM order_costs WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM stock_movements WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM orders WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM reservations WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM shifts WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM product_categories WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM products WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM ingredients WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM guests WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM zones WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM inventory_departments WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM users WHERE venue_id=$1', [id]);
    await client.query('DELETE FROM venues WHERE id=$1', [id]);
    await client.query('ALTER TABLE inventory_purchase_document_lines ENABLE TRIGGER inventory_purchase_line_lifecycle_guard');
    await client.query('ALTER TABLE inventory_purchase_documents ENABLE TRIGGER inventory_purchase_document_delete_guard');
    const scopedTables = await client.query(`SELECT format('%I.%I', table_schema, table_name) AS relation
      FROM information_schema.columns WHERE table_schema='public' AND column_name='venue_id'`);
    for (const { relation } of scopedTables.rows) {
      const remaining = await client.query(`SELECT 1 FROM ${relation} WHERE venue_id::text=$1 LIMIT 1`, [id]);
      assert.equal(remaining.rowCount, 0, `synthetic venue cleanup removes all rows from ${relation}`);
    }
    assert.equal((await client.query('SELECT 1 FROM venues WHERE id=$1', [id])).rowCount, 0,
      'synthetic venue cleanup removes its test venue');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
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
  await client.query('INSERT INTO venues (id,name,timezone) VALUES ($1,$2,$3)', [venueId, 'Синтетическая QA-точка', venueTimezone]);
  await client.query('INSERT INTO users (id,venue_id,full_name,login,role) VALUES ($1,$2,$3,$4,$5)', [actorId, venueId, 'QA Владелец', `qa-${venueId}`, 'owner']);
  await client.query('INSERT INTO inventory_departments (venue_id,code,name) VALUES ($1,$2,$3) ON CONFLICT (venue_id,code) DO UPDATE SET name=EXCLUDED.name', [venueId, 'bar', 'Бар']);
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
      BUSINESS_TIMEZONE: processTimezone,
      PGOPTIONS: '-c timezone=UTC',
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

  const currentDate = await getBusinessDate();
  const timezoneMismatch = await client.query('SELECT (now() AT TIME ZONE $1)::date <> (now() AT TIME ZONE $2)::date AS differs', [processTimezone, venueTimezone]);
  assert.equal(timezoneMismatch.rows[0].differs, true, 'fixture forces process and venue business dates to differ'); checks++;
  await client.query(`INSERT INTO staff_work_logs (venue_id,user_id,started_at,ended_at,source,note)
    VALUES ($1,$2,($3::date::timestamp + INTERVAL '30 minutes') AT TIME ZONE $4,($3::date::timestamp + INTERVAL '90 minutes') AT TIME ZONE $4,'manual','QA venue-local default date')`,
  [venueId, actorId, currentDate, venueTimezone]);
  const defaultWorkTimeResponse = await fetch(`${base}/api/staff/time`);
  assert.equal(defaultWorkTimeResponse.status, 200, 'default work-time request succeeds with venue-local dates');
  const defaultWorkTime = await defaultWorkTimeResponse.json();
  const localBoundaryLog = defaultWorkTime.items.find((entry) => entry.note === 'QA venue-local default date');
  assert.ok(localBoundaryLog, 'omitted work-time dates select the venue-local current date, not the process date');
  assert.equal(Number(localBoundaryLog.hours), 1, 'local-day work-log boundary keeps the exact elapsed hour'); checks += 4;

  const stockItem = await req(base, '/api/inventory/items', 'POST', {
    name: 'QA сироп для продажи', unit: 'мл', itemType: 'ingredient', cost: 0, department: 'bar',
  }, 201);
  const secondStockItem = await req(base, '/api/inventory/items', 'POST', {
    name: 'QA сок для продажи', unit: 'мл', itemType: 'ingredient', cost: 0, department: 'bar',
  }, 201);
  const supplierReceipt = await req(base, '/api/inventory/purchase-documents', 'POST', {
    supplierName: 'Synthetic QA supplier', documentNumber: `QA-${venueId.slice(0, 8)}`,
    documentDate: currentDate, lines: [
      { ingredientId: stockItem.id, quantity: 3, unit: 'л', unitCost: 20 },
      { ingredientId: secondStockItem.id, quantity: 2, unit: 'л', unitCost: 30 },
    ],
  }, 201);
  assert.equal(Number(supplierReceipt.totalCost), 120, 'purchase lines retain their total supplier cost'); checks++;
  const postedReceipt = await req(base, `/api/inventory/purchase-documents/${supplierReceipt.id}/post`, 'POST', {}, 200);
  assert.equal(postedReceipt.document.status, 'posted', 'posting the supplier document commits the receipt'); checks++;
  assert.equal(await getBalance(stockItem.id), 3000, 'posted receipt converts 3 liters into 3000 ml in the stock ledger'); checks++;
  assert.equal(await getBalance(secondStockItem.id), 2000, 'posted receipt converts 2 liters into 2000 ml in the stock ledger'); checks++;
  const firstPurchasePayment = await req(base, `/api/finance/purchase-payables/${supplierReceipt.id}/payments`, 'POST', {
    amount: 45, paymentDate: currentDate, paymentMethod: 'bank_transfer', idempotencyKey: `qa-chain:${venueId}:1`,
  }, 201);
  assert.equal(Number(firstPurchasePayment.balanceDue), 75, 'partial supplier payment leaves the exact open balance'); checks++;
  const finalPurchasePayment = await req(base, `/api/finance/purchase-payables/${supplierReceipt.id}/payments`, 'POST', {
    amount: 75, paymentDate: currentDate, paymentMethod: 'cash', idempotencyKey: `qa-chain:${venueId}:2`,
  }, 201);
  assert.equal(Number(finalPurchasePayment.balanceDue), 0, 'final supplier payment settles the posted purchase'); checks++;

  const product = await req(base, '/api/products', 'POST', {
    name: `QA напиток ${venueId.slice(0, 8)}`, category: 'Бар', price: 150,
  }, 201);
  const recipe = await req(base, '/api/recipes', 'POST', {
    productId: product.id,
    name: product.name,
    ingredients: [
      { ingredientId: stockItem.id, name: stockItem.name, quantity: '1 л' },
      { ingredientId: secondStockItem.id, name: secondStockItem.name, quantity: '200 мл' },
    ],
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
  assert.equal(await getOrderCost(firstOrderId), 26, '1 l at 20 RUB/l plus 200 ml at 30 RUB/l costs 26 RUB and is persisted as COGS'); checks += 2;
  assert.equal(await getBalance(stockItem.id), 2000, 'sale subtracts 1000 ml from the real PostgreSQL ledger'); checks++;
  assert.equal(await getBalance(secondStockItem.id), 1800, 'the second recipe component subtracts 200 ml from its real PostgreSQL ledger'); checks++;

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
  assert.equal(await getBalance(secondStockItem.id), 1800, 'failure rolls back every component movement'); checks++;
  const afterInjectedFailure = await client.query(`SELECT o.status,
      (SELECT count(*)::int FROM payments p WHERE p.order_id=o.id) AS payments,
      (SELECT count(*)::int FROM order_costs c WHERE c.order_id=o.id) AS cogs
    FROM orders o WHERE o.id=$1`, [failedOrderId]);
  assert.deepEqual(afterInjectedFailure.rows[0], { status: 'open', payments: 0, cogs: 0 }, 'failed close leaves order, payments and COGS unchanged'); checks++;
  await client.query(`DROP TRIGGER ${failureTrigger} ON orders`);
  await client.query(`DROP FUNCTION public.${failureFunction}()`);

  const priceChangeReceipt = await req(base, '/api/inventory/purchase-documents', 'POST', {
    supplierName: 'Synthetic QA price change', documentNumber: `QA-PRICE-${venueId.slice(0, 8)}`,
    documentDate: currentDate, lines: [{ ingredientId: stockItem.id, quantity: 1, unit: 'л', unitCost: 100 }],
  }, 201);
  await req(base, `/api/inventory/purchase-documents/${priceChangeReceipt.id}/post`, 'POST', {}, 200);
  await req(base, `/api/finance/purchase-payables/${priceChangeReceipt.id}/payments`, 'POST', {
    amount: 100, paymentDate: currentDate, paymentMethod: 'cash', idempotencyKey: `qa-chain:${venueId}:3`,
  }, 201);
  assert.equal(Number((await client.query('SELECT cost FROM ingredients WHERE id=$1', [stockItem.id])).rows[0].cost), 0.0467,
    'weighted average unit cost retains four decimal places instead of rounding every ml to a kopeck'); checks++;
  const retryClose = await req(base, `/api/orders/${failedOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 200);
  assert.equal(retryClose.status, 'closed');
  assert.equal(await getOrderCost(failedOrderId), 52.7, 'retry rounds final recipe cost to kopecks after preserving weighted unit-cost precision'); checks += 2;
  assert.equal(await getBalance(stockItem.id), 2000, 'retry depletes exactly one portion, not the failed attempt plus retry'); checks++;
  assert.equal(await getBalance(secondStockItem.id), 1600, 'retry consumes exactly one second-component portion after the rolled-back attempt'); checks++;
  const duplicateClose = await req(base, `/api/orders/${failedOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 409);
  assert.equal(duplicateClose.error, 'order_already_final'); checks++;
  assert.equal(await getBalance(stockItem.id), 2000, 'duplicate close cannot deplete inventory again'); checks++;
  assert.equal(await getBalance(secondStockItem.id), 1600, 'duplicate close cannot consume a recipe component again'); checks++;

  const premixOutput = await req(base, '/api/inventory/items', 'POST', {
    name: 'QA premix output', unit: 'мл', itemType: 'ingredient', cost: 0, department: 'bar',
  }, 201);
  const premixRecipe = await req(base, '/api/recipes', 'POST', {
    name: 'QA weighted-cost premix', recipeType: 'premix',
    ingredients: [
      { ingredientId: stockItem.id, name: stockItem.name, quantity: '1 л' },
      { ingredientId: secondStockItem.id, name: secondStockItem.name, quantity: '200 мл' },
    ],
    yieldQuantity: 1200, yieldUnit: 'мл', portionCount: 1,
  }, 201);
  const premixBatch = await req(base, '/api/inventory/premixes/produce', 'POST', {
    recipeId: premixRecipe.id, outputItemId: premixOutput.id, multiplier: 1,
  }, 201);
  assert.equal(Number(premixBatch.totalCost), 52.7, 'premix cost uses the precise weighted cost of the milliliter stock unit');
  assert.equal(Number((await client.query('SELECT cost FROM ingredients WHERE id=$1', [premixOutput.id])).rows[0].cost), 0.0439,
    'premix output persists sub-kopeck unit cost so later recipes do not round each ml to a kopeck');
  assert.equal(await getBalance(premixOutput.id), 1200, 'premix output quantity is added to the stock ledger');
  assert.equal(await getBalance(stockItem.id), 1000, 'premix production consumes its first component exactly once');
  assert.equal(await getBalance(secondStockItem.id), 1400, 'premix production consumes its second component exactly once'); checks += 5;

  const snapshots = await client.query('SELECT cost FROM order_costs WHERE order_id=$1', [firstOrderId]);
  assert.equal(Number(snapshots.rows[0].cost), 26, 'historical COGS snapshot is unchanged after a later purchase changes weighted cost'); checks++;
  const paymentRows = await client.query('SELECT amount,status,shift_id FROM payments WHERE order_id=$1', [failedOrderId]);
  assert.equal(paymentRows.rowCount, 1);
  assert.equal(Number(paymentRows.rows[0].amount), 150);
  assert.equal(paymentRows.rows[0].status, 'paid');
  assert.ok(paymentRows.rows[0].shift_id, 'sale payment retains shift attribution'); checks += 4;
  const activeShift = await client.query('SELECT id FROM shifts WHERE venue_id=$1 AND closed_at IS NULL', [venueId]);
  assert.equal(activeShift.rowCount, 1, 'sale flow retains one active shift for later cash reconciliation'); checks++;

  const previousUtcDate = new Date(`${currentDate}T00:00:00Z`);
  previousUtcDate.setUTCDate(previousUtcDate.getUTCDate() - 1);
  const utcPreviousDayAfterLocalMidnight = `${previousUtcDate.toISOString().slice(0, 10)}T22:30:00Z`;
  await client.query('UPDATE orders SET closed_at=$2::timestamptz WHERE id=$1', [firstOrderId, utcPreviousDayAfterLocalMidnight]);
  await client.query("UPDATE venues SET timezone='Mars/Olympus' WHERE id=$1", [venueId]);
  const fallbackDateRows = await client.query("SELECT (now() AT TIME ZONE 'Asia/Yekaterinburg')::date::text AS date");
  const fallbackDate = fallbackDateRows.rows[0].date;
  const corruptedZoneSummaryResponse = await fetch(`${base}/api/finance/summary`);
  assert.equal(corruptedZoneSummaryResponse.status, 200, 'legacy invalid venue timezone falls back instead of breaking the finance summary');
  const corruptedZoneSummary = await corruptedZoneSummaryResponse.json();
  assert.equal(corruptedZoneSummary.date, fallbackDate, 'corrupted venue timezone uses the established Asia/Yekaterinburg fallback'); checks += 2;
  const corruptedZoneReportResponse = await fetch(`${base}/api/finance/report`);
  assert.equal(corruptedZoneReportResponse.status, 200, 'legacy invalid venue timezone falls back instead of breaking the X report');
  assert.equal((await corruptedZoneReportResponse.json()).date, fallbackDate, 'X report uses the same resilient timezone fallback'); checks += 2;
  await client.query('UPDATE venues SET timezone=$2 WHERE id=$1', [venueId, venueTimezone]);
  const financeSummaryResponse = await fetch(`${base}/api/finance/summary`);
  assert.equal(financeSummaryResponse.status, 200, 'default finance summary succeeds when process and venue dates differ');
  const financeSummary = await financeSummaryResponse.json();
  assert.equal(financeSummary.date, currentDate, 'default finance date comes from the venue timezone, not the process timezone');
  assert.equal(Number(financeSummary.revenue), 300, 'venue-local finance summary includes sales across the UTC date boundary');
  assert.equal(Number(financeSummary.closedOrders), 2, 'venue-local summary counts both checks on the venue business date');
  assert.equal(Number(financeSummary.paymentCount), 2, 'venue-local summary counts both payments across the UTC date boundary'); checks += 5;
  const financeReportResponse = await fetch(`${base}/api/finance/report?date=${encodeURIComponent(currentDate)}&type=x`);
  assert.equal(financeReportResponse.status, 200, 'X report succeeds for explicit venue-local business date');
  const financeReport = await financeReportResponse.json();
  assert.equal(financeReport.date, currentDate, 'X report preserves the requested local calendar date');
  assert.equal(Number(financeReport.revenue), 300, 'X report uses venue-local UTC boundaries');
  assert.equal(financeReport.checksCount, 2, 'X report includes both checks on the venue date'); checks += 4;
  const analyticsResponse = await fetch(`${base}/api/analytics?days=7`);
  assert.equal(analyticsResponse.status, 200);
  const analytics = await analyticsResponse.json();
  const today = analytics.days.find((day) => day.date === currentDate);
  assert.ok(today, 'selected analytics period includes the synthetic sales date');
  assert.match(today.date, /^\d{4}-\d{2}-\d{2}$/, 'analytics serializes PostgreSQL date values as stable ISO calendar dates');
  assert.equal(Number(today.revenue), 300, 'analytics revenue reads both paid product sales');
  assert.equal(Number(today.costOfGoods), 78.7, 'analytics COGS sums the two immutable order snapshots: 26 + 52.7');
  assert.equal(Number(today.expenses), 0, 'supplier principal does not count as a second operating expense');
  assert.equal(Number(today.cashOutflow), 220, 'supplier settlements remain visible in cash flow');
  assert.equal(Number(today.payroll), 0, 'unpaid payroll is not recorded as an incurred operating result');
  assert.equal(Number(today.netProfit), 221.3, 'current-day profit equals revenue 300 minus COGS 78.7'); checks += 8;

  const manualExpenseResponse = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'QA операционные расходы', amount: 18, expenseDate: currentDate, description: 'synthetic operating expense', source: 'manual' }),
  });
  assert.equal(manualExpenseResponse.status, 201);
  const withOperatingExpenseResponse = await fetch(`${base}/api/analytics?days=7`);
  assert.equal(withOperatingExpenseResponse.status, 200);
  const withOperatingExpense = await withOperatingExpenseResponse.json();
  const afterExpense = withOperatingExpense.days.find((day) => day.date === currentDate);
  assert.ok(afterExpense);
  assert.equal(Number(afterExpense.expenses), 18, 'manual operating expense is counted once as accrual');
  assert.equal(Number(afterExpense.cashOutflow), 238, 'cash flow includes 220 RUB supplier payments and one 18 RUB operating payment');
  assert.equal(Number(afterExpense.netProfit), 203.3, 'profit subtracts COGS and manual operating expense');
  assert.equal(Number(withOperatingExpense.netProfit), 203.3, 'period profit equals 300 revenue − 78.7 COGS − 18 expense'); checks += 7;

  const rule = await client.query(`INSERT INTO payroll_rules (venue_id,name,rule_type,rate)
    VALUES ($1,'QA hourly finance','hourly',50) RETURNING id`, [venueId]);
  await client.query(`INSERT INTO staff_work_logs (venue_id,user_id,started_at,ended_at,source)
    VALUES ($1,$2,$3::date::timestamp AT TIME ZONE $4,($3::date::timestamp + INTERVAL '4 hours') AT TIME ZONE $4,'manual')`,
  [venueId, actorId, currentDate, venueTimezone]);
  const payrollDraftResponse = await fetch(`${base}/api/payroll/entries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: actorId, ruleId: rule.rows[0].id, periodFrom: currentDate, periodTo: currentDate }),
  });
  assert.equal(payrollDraftResponse.status, 201);
  const payrollDraft = await payrollDraftResponse.json();
  assert.equal(Number(payrollDraft.amount), 200, 'the payroll amount comes from four worked hours at 50 RUB/hour');
  const approvePayrollResponse = await fetch(`${base}/api/payroll/entries/${payrollDraft.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approvePayrollResponse.status, 200);
  const approvedPayrollAnalyticsResponse = await fetch(`${base}/api/analytics?days=7`);
  assert.equal(approvedPayrollAnalyticsResponse.status, 200);
  const approvedPayrollAnalytics = await approvedPayrollAnalyticsResponse.json();
  const approvedPayrollDay = approvedPayrollAnalytics.days.find((day) => day.date === currentDate);
  assert.ok(approvedPayrollDay);
  assert.equal(Number(approvedPayrollDay.payroll), 200, 'approved salary accrues to operating profit before cash payment');
  assert.equal(Number(approvedPayrollDay.cashOutflow), 238, 'approved-but-unpaid salary is not shown as cash outflow');
  assert.ok(Math.abs(Number(approvedPayrollDay.netProfit) - 3.3) < 0.001, 'accrual profit includes approved salary exactly once');
  const payPayrollResponse = await fetch(`${base}/api/payroll/entries/${payrollDraft.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pay', paymentDate: currentDate }),
  });
  assert.equal(payPayrollResponse.status, 200);
  const paidPayroll = await payPayrollResponse.json();
  assert.ok(paidPayroll.expense_id, 'salary payout is linked to exactly one payroll cashflow expense');
  const afterPayrollResponse = await fetch(`${base}/api/analytics?days=7`);
  assert.equal(afterPayrollResponse.status, 200);
  const afterPayrollAnalytics = await afterPayrollResponse.json();
  const afterPayroll = afterPayrollAnalytics.days.find((day) => day.date === currentDate);
  assert.ok(afterPayroll);
  assert.equal(Number(afterPayroll.payroll), 200, 'paid salary is included in accrued operational result once');
  assert.equal(Number(afterPayroll.expenses), 218, 'profit expenses include the 18 RUB manual cost and 200 RUB salary once');
  assert.equal(Number(afterPayroll.cashOutflow), 438, 'cash flow includes supplier payments, operating expenses and salary actually paid');
  assert.ok(Math.abs(Number(afterPayroll.netProfit) - 3.3) < 0.001, 'profit equals 300 revenue − 78.7 COGS − 18 operating cost − 200 salary');
  assert.ok(Math.abs(Number(afterPayrollAnalytics.netProfit) - 3.3) < 0.001, 'period P&L reconciles to the independently expected result'); checks += 11;

  console.log(`RECIPE DEPLETION POSTGRES API QA: PASS (${checks} assertions; venue-local work log→purchase document/payment→stock→two-component recipe→sale/depletion→COGS→payroll→P&L/cashflow; all data is synthetic)`);
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise((resolve) => server.once('exit', resolve)), delay(3000)]);
  }
  if (client._connected) {
    await cleanSyntheticVenue(venueId);
    await client.end();
  }
}

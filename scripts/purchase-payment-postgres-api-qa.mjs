import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { PurchaseDocumentRepository } from '../db.js';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated PostgreSQL test database');
const parsed = new URL(databaseUrl);
assert.match(parsed.pathname, /(?:test|qa|scratch)/i,
  'refusing test writes unless the database name clearly identifies a test/QA/scratch database');

const require = createRequire(import.meta.url);
const { Client, Pool } = require('pg');
const setup = new Client({ connectionString: databaseUrl });
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const validation = require('../purchase-document-validation.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const routeStart = server.indexOf("if (pathname === '/api/finance/purchase-payables' && req.method === 'GET')");
const routeEnd = server.indexOf("if (pathname === '/api/expenses' && req.method === 'GET')", routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, 'supplier payable/payment API handlers are available');
const route = server.slice(routeStart, routeEnd);
const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
let venueId = null;

const callApi = async ({ path, method = 'GET', body = {}, permissions = ['finance'], venue = venueId }) => {
  let response;
  const pathname = path;
  const result = await new Function('pathname','req','res','repositories','venueDbId','denyUnlessAny','denyUnless','body','json','recordAudit','isOperationalEmployee','validatePurchasePaymentDocument','isValidIsoDate',
    `return (async()=>{${route}})();`)(
    pathname,
    { method, headers: {}, user: { id: null, permissions } }, {},
    { pool, purchaseDocuments: new PurchaseDocumentRepository(pool) }, venue,
    () => false, () => false, async () => body,
    (_res, status, data) => { response = { status, data }; return response; }, () => {}, () => false,
    validation.validateDataUrl, isValidIsoDate,
  );
  return response || result;
};

try {
  await setup.connect();
  venueId = (await setup.query("INSERT INTO venues (name) VALUES ('Isolated purchase-payment API QA') RETURNING id")).rows[0].id;
  const ingredientId = (await setup.query(`INSERT INTO ingredients (venue_id,name,unit,cost,is_marked,purchase_unit,pack_multiplier)
    VALUES ($1,'QA syrup','ml',0,true,'bottle',1000) RETURNING id`, [venueId])).rows[0].id;

  const repository = new PurchaseDocumentRepository(pool);
  const draft = await repository.saveDraft({
    venueId, supplierName: 'QA supplier', documentNumber: `QA-${process.pid}`, documentDate: '2026-09-27',
    lines: [{ ingredientId, quantity: 2, unit: 'bottle', unitCost: 100 }],
  });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.totalCost, 200);
  assert.equal(draft.lines[0].stockQuantity, 2000, 'purchase packaging converts to stock units');
  const unposted = await callApi({ path: `/api/finance/purchase-payables/${draft.id}/payments`, method: 'POST', body: {
    amount: 1, paymentDate: '2026-09-27', paymentMethod: 'cash', idempotencyKey: `qa:draft:${process.pid}`,
  } });
  assert.equal(unposted.status, 409, 'payment API refuses to settle an unposted draft');
  assert.equal(unposted.data.error, 'purchase_document_not_posted');

  const posted = await repository.post(venueId, draft.id, null);
  assert.equal(posted.totalCost, 200);
  assert.equal(posted.movementIds.length, 1, 'posting creates a stock movement from the receipt');
  const onHand = await setup.query("SELECT COALESCE(SUM(CASE WHEN direction IN ('in','transfer','adjustment') THEN quantity ELSE -quantity END),0)::numeric AS amount FROM stock_movements WHERE venue_id=$1 AND ingredient_id=$2", [venueId, ingredientId]);
  assert.equal(Number(onHand.rows[0].amount), 2000, 'posted receipt updates the stock ledger');

  let payables = await callApi({ path: '/api/finance/purchase-payables' });
  assert.equal(payables.status, 200);
  assert.equal(payables.data.items.find((item) => item.id === draft.id).balanceDue, 200);
  const paymentPath = `/api/finance/purchase-payables/${draft.id}/payments`;
  const otherVenue = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const foreignHistory = await callApi({ path: paymentPath, venue: otherVenue });
  assert.equal(foreignHistory.status, 404, 'payment history API hides another venue receipt');
  const foreignPayment = await callApi({ path: paymentPath, method: 'POST', venue: otherVenue, body: {
    amount: 1, paymentDate: '2026-09-27', paymentMethod: 'cash', idempotencyKey: `qa:foreign:${process.pid}`,
  } });
  assert.equal(foreignPayment.status, 404, 'payment API cannot settle another venue receipt');
  const payment = { amount: 75, paymentDate: '2026-09-27', paymentMethod: 'bank_transfer', idempotencyKey: `qa:payment:${process.pid}` };
  const first = await callApi({ path: paymentPath, method: 'POST', body: payment });
  assert.equal(first.status, 201);
  assert.equal(first.data.balanceDue, 125);
  const retry = await callApi({ path: paymentPath, method: 'POST', body: payment });
  assert.equal(retry.status, 200, `same payment key returns an idempotent replay: ${JSON.stringify(retry)}`);
  assert.equal(retry.data.idempotent, true);
  const conflict = await callApi({ path: paymentPath, method: 'POST', body: { ...payment, amount: 74 } });
  assert.equal(conflict.status, 409, 'reusing the payment key with a changed amount is rejected');
  const overpay = await callApi({ path: paymentPath, method: 'POST', body: { ...payment, amount: 126, idempotencyKey: `qa:overpay:${process.pid}` } });
  assert.equal(overpay.status, 409);
  assert.equal(overpay.data.error, 'purchase_payment_exceeds_balance');

  const final = await callApi({ path: paymentPath, method: 'POST', body: { ...payment, amount: 125, idempotencyKey: `qa:final:${process.pid}`, paymentMethod: 'cash' } });
  assert.equal(final.status, 201);
  assert.equal(final.data.balanceDue, 0);
  payables = await callApi({ path: '/api/finance/purchase-payables' });
  assert.equal(payables.data.items.find((item) => item.id === draft.id).paymentStatus, 'paid');
  const history = await callApi({ path: paymentPath });
  assert.equal(history.status, 200);
  assert.equal(history.data.items.length, 2, 'payment history records each real settlement once');
  assert.deepEqual(history.data.items.map((item) => Number(item.amount)).sort((a, b) => a - b), [75, 125]);
  assert.ok(history.data.items.every((item) => item.paymentDate === '2026-09-27'),
    'payment history exposes the original local calendar day instead of a timezone-shifted JavaScript Date');
  const expenses = await setup.query("SELECT COUNT(*)::int AS count,COALESCE(SUM(amount),0)::numeric AS total FROM expenses WHERE venue_id=$1 AND purchase_document_id=$2 AND source='purchase'", [venueId, draft.id]);
  assert.equal(expenses.rows[0].count, 2, 'cashflow contains only two committed settlements');
  assert.equal(Number(expenses.rows[0].total), 200, 'settlements reconcile to receipt cost without duplicate retry or overpayment');

  console.log('PURCHASE PAYMENT POSTGRES API QA: PASS (real PostgreSQL draft → posted receipt → stock ledger → payables → partial/full payment APIs; replay/conflict/overpay/draft/tenant behavior and payment history verified)');
} finally {
  await pool.end();
  if (setup._connected) {
    if (venueId) {
      await setup.query('BEGIN');
      try {
        // The posted-receipt audit triggers intentionally prohibit deletion.
        // This is a disposable QA database and the venue is uniquely generated
        // by this test, so bypass user triggers only for this narrow cleanup tx.
        await setup.query('SET LOCAL session_replication_role = replica');
        await setup.query('DELETE FROM expenses WHERE venue_id=$1', [venueId]);
        await setup.query('DELETE FROM stock_movements WHERE venue_id=$1', [venueId]);
        await setup.query('DELETE FROM inventory_purchase_document_lines WHERE venue_id=$1', [venueId]);
        await setup.query('DELETE FROM inventory_purchase_documents WHERE venue_id=$1', [venueId]);
        await setup.query('DELETE FROM ingredients WHERE venue_id=$1', [venueId]);
        await setup.query('DELETE FROM venues WHERE id=$1', [venueId]);
        await setup.query('COMMIT');
      } catch (error) {
        await setup.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
    await setup.end();
  }
}

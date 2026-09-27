import assert from 'node:assert/strict';
import { PurchaseDocumentRepository } from '../db.js';

class FakePool {
  constructor() {
    this.documents = new Map([
      ['posted-doc', { id: 'posted-doc', venueId: 'venue-a', supplierName: 'Поставщик', documentNumber: 'П-1', status: 'posted', totalCost: 1000 }],
      ['draft-doc', { id: 'draft-doc', venueId: 'venue-a', supplierName: 'Поставщик', documentNumber: 'П-2', status: 'draft', totalCost: 100 }],
      ['other-venue-doc', { id: 'other-venue-doc', venueId: 'venue-b', supplierName: 'Другой', status: 'posted', totalCost: 500 }],
    ]);
    this.expenses = [];
  }
  async query(sql, params = []) {
    if (sql.includes('SELECT id FROM inventory_purchase_documents WHERE id=$1 AND venue_id=$2')) {
      const row = this.documents.get(String(params[0]));
      return { rows: row && row.venueId === params[1] && row.status === 'posted' ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('FROM expenses e') && sql.includes('e.purchase_document_id=$2')) {
      const rows = this.expenses.filter((expense) => expense.venueId === params[0] && expense.purchaseDocumentId === params[1])
        .map((expense) => ({ id: expense.id, amount: expense.amount, paymentDate: expense.expenseDate, paymentMethod: expense.paymentMethod, documentUrl: expense.documentUrl }));
      return { rows, rowCount: rows.length };
    }
    throw new Error(`Unexpected SQL in fake purchase payment QA: ${sql}`);
  }
  async connect() {
    return { query: async (sql, params = []) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM inventory_purchase_documents WHERE id=$1 AND venue_id=$2 FOR UPDATE')) {
        const row = this.documents.get(String(params[0]));
        return { rows: row && row.venueId === params[1] ? [{ id: row.id, supplierName: row.supplierName, documentNumber: row.documentNumber, status: row.status }] : [], rowCount: row?.venueId === params[1] ? 1 : 0 };
      }
      if (sql.includes('FROM expenses WHERE venue_id=$1 AND idempotency_key=$2 FOR UPDATE')) {
        const row = this.expenses.find((expense) => expense.venueId === params[0] && expense.idempotencyKey === params[1]);
        return { rows: row ? [{ id: row.id, purchaseDocumentId: row.purchaseDocumentId, amount: row.amount, expenseDate: row.expenseDate, paymentMethod: row.paymentMethod, documentUrl: row.documentUrl }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes('SELECT COALESCE((SELECT SUM(line_total)')) {
        const doc = this.documents.get(String(params[0]));
        const totalPaid = this.expenses.filter((expense) => expense.venueId === params[1] && expense.purchaseDocumentId === params[0]).reduce((sum, expense) => sum + expense.amount, 0);
        return { rows: [{ totalCost: doc?.totalCost || 0, totalPaid }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO expenses')) {
        const [venueId, amount, expenseDate, description, documentUrl, createdBy, purchaseDocumentId, idempotencyKey, paymentMethod] = params;
        const row = { id: `expense-${this.expenses.length + 1}`, venueId, amount: Number(amount), expenseDate, description, documentUrl, createdBy, purchaseDocumentId, idempotencyKey, paymentMethod };
        this.expenses.push(row);
        return { rows: [{ id: row.id }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in fake purchase payment QA: ${sql}`);
    }, release() {} };
  }
}

const pool = new FakePool();
const repo = new PurchaseDocumentRepository(pool);
const base = { id: 'posted-doc', venueId: 'venue-a', paymentDate: '2026-09-27', paymentMethod: 'bank_transfer', documentUrl: '', createdBy: null };
const evidence = 'data:application/pdf;base64,SGVsbG8=';
const first = await repo.addPayment({ ...base, documentUrl: evidence, amount: 250, idempotencyKey: 'payment-key-0001' });
assert.equal(first.totalPaid, 250);
assert.equal(first.balanceDue, 750);
assert.equal(first.idempotent, false);
const retry = await repo.addPayment({ ...base, documentUrl: evidence, amount: 250, idempotencyKey: 'payment-key-0001' });
assert.equal(retry.idempotent, true);
assert.equal(pool.expenses.length, 1, 'an identical retry must not create a duplicate cash movement');
await assert.rejects(repo.addPayment({ ...base, amount: 200, idempotencyKey: 'payment-key-0001' }), /purchase_payment_idempotency_conflict/);
await assert.rejects(repo.addPayment({ ...base, amount: 751, idempotencyKey: 'payment-key-0002' }), /purchase_payment_exceeds_balance/);
assert.equal(pool.expenses.length, 1, 'an overpayment must not write an expense');
const final = await repo.addPayment({ ...base, amount: 750, idempotencyKey: 'payment-key-0003' });
assert.equal(final.totalPaid, 1000);
assert.equal(final.balanceDue, 0);
const history = await repo.listPayments('venue-a', 'posted-doc');
assert.equal(history.length, 2, 'history includes each payment, not just the invoice total');
assert.deepEqual(history.map((payment) => payment.amount), [250, 750]);
assert.equal(history[0].paymentMethod, 'bank_transfer');
assert.equal(history[0].paymentDate, '2026-09-27');
assert.equal(history[0].documentUrl, evidence, 'payment evidence stays attached to its individual settlement');
assert.equal(await repo.listPayments('venue-a', 'draft-doc'), null, 'draft invoices cannot expose payable payment history');
assert.equal(await repo.listPayments('venue-b', 'posted-doc'), null, 'invoice history is tenant scoped');
await assert.rejects(repo.addPayment({ ...base, amount: 0.01, idempotencyKey: 'payment-key-0004' }), /purchase_payment_exceeds_balance/);
await assert.rejects(repo.addPayment({ ...base, id: 'draft-doc', amount: 1, idempotencyKey: 'payment-key-0005' }), /purchase_document_not_posted/);
await assert.rejects(repo.addPayment({ ...base, id: 'other-venue-doc', amount: 1, idempotencyKey: 'payment-key-0006' }), /purchase_document_not_found/);
console.log('PURCHASE PAYMENT REPOSITORY RUNTIME QA: PASS (partial settlement, idempotency, conflict, overpayment, status, payment history, tenant scope)');

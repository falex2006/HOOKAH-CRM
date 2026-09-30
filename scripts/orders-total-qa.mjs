import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const start = source.indexOf('  const total = (order) => {', source.indexOf('function renderOrders()'));
const end = source.indexOf('\n  const displayOrderId', start);
assert.ok(start > 0 && end > start);
const total = new Function(`${source.slice(start, end)}; return total;`)();
const items = [{ unitPrice: 100, quantity: 1 }];
for (const status of ['open', 'in_progress', 'ready']) {
  assert.equal(total({ status, items, finalTotal: 0 }), 100);
  assert.equal(total({ status, items, finalTotal: 40 }), 100);
}
assert.equal(total({ status: 'closed', items, finalTotal: 0 }), 0);
assert.equal(total({ status: 'closed', items, finalTotal: 80 }), 80);
assert.equal(total({ status: 'closed', items, total: 90 }), 90);
assert.equal(total({ status: 'cancelled', items, finalTotal: 0 }), 0);
assert.equal(total({ status: 'open', items: [{ unitPrice: 0, price: 100, quantity: 2 }] }), 0);
assert.equal(total({ status: 'open', items: [{ price: 50, quantity: 2 }] }), 100);
assert.equal(total({ status: 'open', items: [] }), 0);
console.log('Orders total QA PASS: active item sums, partial payments, terminal zero and discounted bills.');

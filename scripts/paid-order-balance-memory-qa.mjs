import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: '', AUTH_REQUIRED: 'false', DEMO_MODE: 'true', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
const base = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`QA server did not start: ${output}`)), 15000);
  child.once('error', reject);
  child.stdout.on('data', () => { const match = output.match(/CRM running on http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
});
async function call(path, method = 'GET', body, expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
try {
  assert.equal((await call('/api/health')).database, 'memory');
  await call('/api/shifts', 'POST', { openingCash: 0 }, 201);
  const product = await call('/api/products', 'POST', { name: 'QA paid order service', category: 'Услуги', price: 100, inventoryMode: 'non_stock' }, 201);
  const order = await call('/api/orders', 'POST', { tableId: 'paid-order-balance-qa' }, 201);
  const item = await call(`/api/orders/${order.id}/items`, 'POST', { productId: product.id, quantity: 2 }, 201);
  assert.equal((await call(`/api/orders/${order.id}`, 'PATCH', { clientId: 'missing-client', notes: 'must rollback' }, 404)).error, 'client_not_found');
  assert.equal((await call('/api/orders')).items.find((entry) => entry.id === order.id)?.notes, '', 'rejected guest edit leaves memory notes unchanged');
  for (const quantity of [1.5, 1000]) assert.equal((await call(`/api/orders/${order.id}/items/${item.id}`, 'PATCH', { quantity }, 400)).error, 'quantity_must_be_positive');
  await call(`/api/orders/${order.id}/payments`, 'POST', { amount: 150, method: 'cash' }, 201);
  const initial = await call(`/api/orders/${order.id}/payments`);
  assert.equal(initial.remaining, 50);
  const edit = await call(`/api/orders/${order.id}/items/${item.id}`, 'PATCH', { quantity: 1 }, 409);
  assert.equal(edit.error, 'paid_order_total_conflict');
  assert.equal(edit.paid, 150);
  assert.equal(edit.due, 100);
  assert.equal((await call(`/api/orders/${order.id}/payments`)).due, 200, 'rejected edit preserves total');
  assert.equal((await call(`/api/orders/${order.id}/items/${item.id}`, 'DELETE', undefined, 409)).error, 'paid_order_total_conflict');
  assert.equal((await call(`/api/orders/${order.id}/split`, 'POST', { itemIds: [item.id] }, 409)).error, 'paid_order_total_conflict');
  assert.equal((await call(`/api/orders/${order.id}/status`, 'POST', { status: 'cancelled' }, 409)).error, 'paid_order_cannot_cancel');
  assert.equal((await call(`/api/orders/${order.id}`, 'DELETE', { comment: 'QA', writeoff: false }, 409)).error, 'paid_order_cannot_cancel');
  const discount = await call(`/api/orders/${order.id}/discount-requests`, 'POST', { type: 'percent', value: 50, reason: 'QA' }, 201);
  assert.equal((await call(`/api/discount-requests/${discount.id}/approve`, 'POST', {}, 409)).error, 'paid_order_total_conflict');
  assert.equal((await call(`/api/orders/${order.id}/payments`)).due, 200, 'rejected discount preserves total');
  assert.equal((await call(`/api/orders/${order.id}/payments`, 'POST', { amount: 50.01, method: 'card' }, 409)).error, 'payment_exceeds_due');
  assert.equal((await call(`/api/orders/${order.id}/payments`, 'POST', { amount: 0.001, method: 'card' }, 400)).error, 'valid_method_and_amount_required');
  assert.equal((await call(`/api/orders/${order.id}/payments`, 'POST', { amount: 50.001, method: 'card' }, 400)).error, 'valid_method_and_amount_required');
  const final = await call(`/api/orders/${order.id}/payments`, 'POST', { amount: 50, method: 'card' }, 201);
  assert.equal(final.closed, true);
  assert.equal(final.paid, 200);
  console.log('PAID ORDER BALANCE MEMORY QA: PASS');
} finally {
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
}

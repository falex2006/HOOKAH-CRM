import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATABASE_URL: '', DEMO_MODE: 'true', AUTH_REQUIRED: 'false', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
let base;
try {
  const until = Date.now() + 15000;
  while (!base && Date.now() < until) {
    const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) base = `http://127.0.0.1:${match[1]}`;
    else if (child.exitCode !== null) throw new Error(`QA server exited early:\n${output}`);
    else await delay(50);
  }
  assert.ok(base, `isolated QA server starts; output: ${output}`);
  let checks = 0;
  async function req(url, method = 'GET', data, expected = 200) {
    const response = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(result)}`);
    checks++;
    return result;
  }
  const health = await req('/api/health');
  assert.equal(health.database, 'memory', 'runtime test exercises the actual isolated in-memory API path'); checks++;
  await req('/api/shifts', 'POST', { openingCash: 0 }, 201);

  const stockItem = await req('/api/inventory/items', 'POST', { name: 'QA recipe stock', unit: 'мл', itemType: 'ingredient', cost: 0.01 }, 201);
  await req('/api/inventory/movements', 'POST', { itemId: stockItem.id, delta: 1000, unit: 'мл', reason: 'Recipe runtime QA supply' }, 201);
  const product = await req('/api/products', 'POST', { name: `QA recipe sale ${Date.now()}`, category: 'bar', price: 100 }, 201);
  await req('/api/recipes', 'POST', { productId: product.id, name: product.name, ingredients: [], yieldQuantity: 1, yieldUnit: 'порция', portionCount: 1 }, 400);
  await req('/api/recipes', 'POST', { productId: product.id, name: product.name, ingredients: [{ ingredientId: stockItem.id, name: stockItem.name, quantity: '1 л' }], yieldQuantity: 1, yieldUnit: 'порция', portionCount: 1 }, 201);
  await req('/api/recipes', 'POST', { productId: product.id, name: 'QA incompatible unit', ingredients: [{ ingredientId: stockItem.id, name: stockItem.name, quantity: '1 кг' }], yieldQuantity: 1, yieldUnit: 'порция', portionCount: 1 }, 400);

  async function createOrder() {
    const order = await req('/api/orders', 'POST', { tableId: `qa-${Date.now()}-${Math.random()}` }, 201);
    await req(`/api/orders/${order.id}/items`, 'POST', { productId: product.id, quantity: 1 }, 201);
    return order.id;
  }
  const successfulOrderId = await createOrder();
  const close = await req(`/api/orders/${successfulOrderId}/close`, 'POST', { paymentMethod: 'cash' });
  assert.equal(close.status, 'closed'); assert.equal(close.costOfGoods, 10, '1 l recipe cost is calculated from 1000 ml at 0.01 per ml'); checks += 2;
  const afterSale = await req('/api/inventory');
  assert.equal(afterSale.items.find((item) => item.id === stockItem.id).onHand, 0, 'sale depletes linked inventory after valid conversion'); checks++;

  const rejectedOrderId = await createOrder();
  const rejectedClose = await req(`/api/orders/${rejectedOrderId}/close`, 'POST', { paymentMethod: 'cash' }, 409);
  assert.equal(rejectedClose.error, 'insufficient_recipe_stock'); checks++;
  const openOrder = (await req('/api/orders')).items.find((entry) => entry.id === rejectedOrderId);
  assert.equal(openOrder.status, 'open', 'failed depletion does not close the order'); checks++;
  assert.equal((await req(`/api/orders/${rejectedOrderId}/payments`)).items.length, 0, 'failed depletion records no payment'); checks++;
  assert.equal((await req('/api/inventory')).items.find((item) => item.id === stockItem.id).onHand, 0, 'failed depletion leaves stock unchanged'); checks++;

  console.log(`RECIPE DEPLETION RUNTIME QA: ${checks} checks passed (memory API path; PostgreSQL requires a separate test server)`);
} finally {
  child.kill();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
}

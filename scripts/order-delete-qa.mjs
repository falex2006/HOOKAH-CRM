import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const staffSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
assert.match(source, /order_delete_comment_required/);
assert.match(source, /order_delete_writeoff_required/);
assert.match(source, /depleteRecipeForOrder\(repositories\.pool, orderDelete\[1\], venueDbId, req\.user\?\.id, client\)/);
assert.match(source, /type: 'order_deleted'/);
assert.match(staffSource, /#order-delete/);
assert.match(staffSource, /method:'DELETE'/);
assert.match(staffSource, /name:'comment'.*required:true/s);
assert.match(staffSource, /name:'writeoff'.*type:'select'/s);
assert.match(staffSource, /order_delete_comment_required/);
assert.match(staffSource, /error\.payload=payload/);
assert.match(portalSource, /type === 'order_deleted'/);

const port = 3221;
const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), AUTH_REQUIRED: 'false', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const request = async (path, options = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text(); let payload; try { payload = JSON.parse(text); } catch (_) { payload = text; }
  return { status: response.status, payload };
};
const post = (path, value) => request(path, { method: 'POST', body: JSON.stringify(value) });
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 800); child.once('error', reject); child.once('exit', (code) => code && reject(new Error(`server exited ${code}`))); });
  let result = await post('/api/orders', { tableId: 'qa-delete-table-1' }); assert.equal(result.status, 201); const first = result.payload;
  result = await request(`/api/orders/${first.id}`, { method: 'DELETE', body: JSON.stringify({ writeoff: false }) }); assert.equal(result.status, 400); assert.equal(result.payload.error, 'order_delete_comment_required');
  result = await request(`/api/orders/${first.id}`, { method: 'DELETE', body: JSON.stringify({ comment: 'Проверка удаления' }) }); assert.equal(result.status, 400); assert.equal(result.payload.error, 'order_delete_writeoff_required');
  result = await request(`/api/orders/${first.id}`, { method: 'DELETE', body: JSON.stringify({ comment: 'Проверка удаления', writeoff: false }) }); assert.equal(result.status, 200); assert.equal(result.payload.status, 'cancelled'); assert.equal(result.payload.notification.type, 'order_deleted'); assert.ok(result.payload.notification.notificationRecipients.includes('manager'));
  result = await request('/api/notifications'); assert.equal(result.status, 200); assert.ok(result.payload.items.some((item) => item.type === 'order_deleted' && item.orderId === first.id));
  result = await post('/api/orders', { tableId: 'qa-delete-table-2' }); assert.equal(result.status, 201); const second = result.payload;
  result = await request(`/api/orders/${second.id}`, { method: 'DELETE', body: JSON.stringify({ comment: 'Проверка списания', writeoff: true }) }); assert.equal(result.status, 200); assert.equal(result.payload.writeoff, true);
  result = await request('/api/inventory/items', { method: 'POST', body: JSON.stringify({ name: 'QA списание', unit: 'шт', itemType: 'ingredient', cost: 5 }) }); assert.equal(result.status, 201); const ingredient = result.payload;
  result = await post('/api/inventory/supplies', { itemId: ingredient.id, quantity: 10, unit: 'шт', unitCost: 5 }); assert.equal(result.status, 201);
  result = await request('/api/products', { method: 'POST', body: JSON.stringify({ name: 'QA блюдо удаления', category: 'bar', price: 100 }) }); assert.equal(result.status, 201); const product = result.payload;
  result = await post('/api/recipes', { productId: product.id, name: product.name, ingredients: [{ ingredientId: ingredient.id, name: ingredient.name, quantity: '2 шт' }], yieldQuantity: 1, yieldUnit: 'порция', portionCount: 1 }); assert.equal(result.status, 201);
  result = await post('/api/orders', { tableId: 'qa-delete-table-3' }); assert.equal(result.status, 201); const third = result.payload;
  result = await post(`/api/orders/${third.id}/items`, { productId: product.id, quantity: 1 }); assert.equal(result.status, 201);
  result = await request(`/api/orders/${third.id}`, { method: 'DELETE', body: JSON.stringify({ comment: 'Списать ингредиенты', writeoff: true }) }); assert.equal(result.status, 200); assert.equal(result.payload.totalCost, 10);
  result = await request('/api/inventory'); assert.equal(Number(result.payload.items.find((item) => item.id === ingredient.id)?.onHand), 8);
  console.log('ORDER DELETE QA: comment, writeoff, notification and stock-depletion checks passed');
} finally { child.kill('SIGTERM'); }

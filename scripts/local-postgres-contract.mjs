import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const mode = process.env.MODE || 'create';
const response = async (path, options) => {
  const result = await fetch(`${base}${path}`, options);
  const body = await result.json();
  assert.equal(result.ok, true, `${path} returned ${result.status}: ${JSON.stringify(body)}`);
  return body;
};

if (mode === 'create') {
  const floor = await response('/api/floor');
  const table = floor.zones.flatMap(zone => zone.tables || []).find(entry => entry.status === 'free');
  assert.ok(table?.id, 'seeded PostgreSQL floor must expose a free table');
  const order = await response('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tableId: table.id, notes: 'postgres persistence contract' })
  });
  assert.ok(order.id, 'created PostgreSQL order must have an id');
  process.stdout.write(order.id);
} else if (mode === 'verify') {
  const orderId = process.env.ORDER_ID;
  assert.ok(orderId, 'ORDER_ID is required in verify mode');
  const orders = await response('/api/orders?scope=all');
  assert.ok(orders.items.some(item => item.id === orderId), 'order must survive CRM restart');
  console.log('LOCAL POSTGRES CONTRACT: PASS (order survived CRM restart)');
} else {
  throw new Error(`Unsupported MODE: ${mode}`);
}

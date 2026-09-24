import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const mode = process.env.MODE || 'create';
const response = async (path, options) => {
  const result = await fetch(`${base}${path}`, options);
  const body = await result.json();
  assert.equal(result.ok, true, `${path} returned ${result.status}: ${JSON.stringify(body)}`);
  return body;
};

if (mode === 'create') {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const table = await client.query("SELECT t.id FROM tables t JOIN zones z ON z.id=t.zone_id WHERE z.venue_id='00000000-0000-0000-0000-000000000001' ORDER BY t.name LIMIT 1");
    assert.ok(table.rows[0]?.id, 'seeded PostgreSQL floor must expose a table');
    const order = await client.query(
      "INSERT INTO orders (venue_id,table_id,opened_by,notes) VALUES ('00000000-0000-0000-0000-000000000001',$1,'20000000-0000-0000-0000-000000000001','postgres persistence contract') RETURNING id",
      [table.rows[0].id]
    );
    process.stdout.write(order.rows[0].id);
  } finally {
    await client.end();
  }
} else if (mode === 'verify') {
  const orderId = process.env.ORDER_ID;
  assert.ok(orderId, 'ORDER_ID is required in verify mode');
  const orders = await response('/api/orders?scope=all');
  assert.ok(orders.items.some(item => item.id === orderId), 'order must survive CRM restart');
  console.log('LOCAL POSTGRES CONTRACT: PASS (order survived CRM restart)');
} else {
  throw new Error(`Unsupported MODE: ${mode}`);
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertQaDatabaseIdentity, isDisposableLoopbackQaContainer, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3219';
const target = new URL(base);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '3219' || process.env.CRM_QA_DATABASE_NAME !== 'territory_qa') {
  throw new Error('Use the isolated port 3219 server and explicitly identify territory_qa');
}
const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
const identity = validateQaDatabaseUrl(databaseUrl, 'purchase auto-order QA database');
assert.equal(identity.database, 'territory_qa');
assert.equal(Number(identity.url.port), 55433, 'use the disposable QA PostgreSQL port');
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
try {
  const { rows } = await pool.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
    inet_server_port() AS port, COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false) AS superuser`);
  assertQaDatabaseIdentity(rows[0], identity.database, Number(identity.url.port), 'purchase auto-order QA database');
  const containerName = process.env.MIGRATIONS_PG_TEST_DOCKER_CONTAINER;
  if (!containerName) throw new Error('This fixture test requires a disposable QA PostgreSQL container');
  const inspected = spawnSync('docker', ['inspect', containerName], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
  if (inspected.error || inspected.status !== 0) throw new Error('Disposable QA PostgreSQL container unavailable');
  const container = JSON.parse(inspected.stdout)[0];
  assert.ok(isDisposableLoopbackQaContainer(container, rows[0].address, Number(rows[0].port), Number(identity.url.port)), 'QA PostgreSQL must be an auto-removed, loopback-only disposable container');
} finally { await pool.end(); }
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(3219, '127.0.0.1', () => probe.close(resolve));
});
const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore',
  env: { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: '3219', AUTH_REQUIRED: 'false', DEMO_MODE: 'false', VENUE_ID: '00000000-0000-0000-0000-000000000001' },
});
let childError = null;
child.on('error', (error) => { childError = error; });
let serverReady = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  if (childError) throw childError;
  if (child.exitCode !== null) throw new Error('Isolated QA server exited before health check');
  try {
    const response = await fetch(`${base}/api/health`);
    if (response.ok && (await response.json()).database === 'postgres') { serverReady = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!serverReady) { child.kill(); throw new Error('Isolated QA PostgreSQL server did not become healthy'); }
const request = async (path, method = 'GET', input, expectedStatus = 200) => {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
};
try {
const health = await request('/api/health');
assert.equal(health.database, 'postgres', 'QA server must use PostgreSQL');

const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const item = await request('/api/inventory/items', 'POST', {
  name: `QA Поступление ${suffix}`, department: 'bar', itemType: 'ingredient', unit: 'мл',
  purchaseUnit: 'бутылка', packMultiplier: 1000, cost: 0.5, minLevel: 20,
}, 201);
assert.equal(Number(item.onHand || 0), 0);
const suggestions = await request('/api/inventory/auto-orders');
assert.ok(suggestions.items.some((entry) => entry.id === item.id), 'new low-stock item appears in recommendations');
const order = await request('/api/inventory/auto-orders', 'POST', { items: [{ itemId: item.id, quantity: 2000 }] }, 201);
assert.equal(order.status, 'sent');
assert.equal(Number(order.lines[0].receivedQuantity), 0);

const createDraft = (number, sourceAutoOrderId = order.id) => request('/api/inventory/purchase-documents', 'POST', {
  supplierName: 'QA поставщик', documentNumber: `QA-${suffix}-${number}`, sourceAutoOrderId,
  lines: [{ ingredientId: item.id, quantity: 1, unit: 'бутылка', unitCost: 250 }],
}, 201);
const firstDraft = await createDraft('1');
assert.equal(firstDraft.status, 'draft');
assert.equal(Number(firstDraft.lines[0].stockQuantity), 1000);
assert.equal(Number((await request('/api/inventory')).items.find((entry) => entry.id === item.id).onHand), 0, 'draft must not change stock');
await request(`/api/inventory/auto-orders/${order.id}`, 'PATCH', { status: 'cancelled' }, 409);

const posted = await request(`/api/inventory/purchase-documents/${firstDraft.id}/post`, 'POST', undefined, 200);
assert.equal(posted.document.status, 'posted');
assert.equal(Number((await request('/api/inventory')).items.find((entry) => entry.id === item.id).onHand), 1000);
await request(`/api/inventory/purchase-documents/${firstDraft.id}/post`, 'POST', undefined, 409);
let refreshedOrder = (await request('/api/inventory/auto-orders')).requests.find((entry) => entry.id === order.id);
assert.equal(refreshedOrder.status, 'partially_received');
assert.equal(Number(refreshedOrder.lines[0].receivedQuantity), 1000);

const abandonedDraft = await createDraft('void');
const voided = await request(`/api/inventory/purchase-documents/${abandonedDraft.id}/void`, 'POST');
assert.equal(voided.status, 'voided');
assert.equal(Number((await request('/api/inventory')).items.find((entry) => entry.id === item.id).onHand), 1000, 'void must not change stock');
refreshedOrder = (await request('/api/inventory/auto-orders')).requests.find((entry) => entry.id === order.id);
assert.equal(Number(refreshedOrder.lines[0].receivedQuantity), 1000, 'void must not count as received');

const finalDraft = await createDraft('2');
await request(`/api/inventory/purchase-documents/${finalDraft.id}/post`, 'POST');
refreshedOrder = (await request('/api/inventory/auto-orders')).requests.find((entry) => entry.id === order.id);
assert.equal(refreshedOrder.status, 'received');
assert.equal(Number(refreshedOrder.lines[0].receivedQuantity), 2000);
const finalStock = (await request('/api/inventory')).items.find((entry) => entry.id === item.id);
assert.equal(Number(finalStock.onHand), 2000);
assert.equal(Number(finalStock.cost), 0.25);
const cancellableOrder = await request('/api/inventory/auto-orders', 'POST', { items: [{ itemId: item.id, quantity: 1000 }] }, 201);
const cancellableDraft = await createDraft('cancel', cancellableOrder.id);
await request(`/api/inventory/auto-orders/${cancellableOrder.id}`, 'PATCH', { status: 'cancelled' }, 409);
await request(`/api/inventory/purchase-documents/${cancellableDraft.id}/void`, 'POST');
const cancelled = await request(`/api/inventory/auto-orders/${cancellableOrder.id}`, 'PATCH', { status: 'cancelled' });
assert.equal(cancelled.status, 'cancelled', 'voided draft must release cancellation lock');
const verificationPool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
try {
  const { rows: [storedOrder] } = await verificationPool.query('SELECT status,lines FROM inventory_auto_orders WHERE id=$1', [order.id]);
  assert.equal(storedOrder.status, 'received');
  assert.equal(Number(storedOrder.lines[0].receivedQuantity), 2000);
  const { rows: storedDocuments } = await verificationPool.query(`SELECT d.id,d.status,l.source_movement_id AS movement_id
    FROM inventory_purchase_documents d JOIN inventory_purchase_document_lines l ON l.document_id=d.id
    WHERE d.id=ANY($1::uuid[])`, [[firstDraft.id, abandonedDraft.id, finalDraft.id]]);
  const byId = new Map(storedDocuments.map((row) => [row.id, row]));
  assert.equal(byId.get(firstDraft.id).status, 'posted');
  assert.ok(byId.get(firstDraft.id).movement_id);
  assert.equal(byId.get(abandonedDraft.id).status, 'voided');
  assert.equal(byId.get(abandonedDraft.id).movement_id, null);
  assert.equal(byId.get(finalDraft.id).status, 'posted');
  assert.ok(byId.get(finalDraft.id).movement_id);
} finally { await verificationPool.end(); }
console.log('PASS isolated PostgreSQL auto-order → draft → partial receipt → void → full receipt');
} finally {
  child.kill();
  if (child.exitCode === null) await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

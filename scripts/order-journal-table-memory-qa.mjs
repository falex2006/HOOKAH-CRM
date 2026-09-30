import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: '', AUTH_REQUIRED: 'true', DEMO_ADMIN_PASSWORD: 'admin' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const baseUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('memory server did not start')), 15_000);
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('exit', () => { clearTimeout(timer); reject(new Error('memory server exited early')); });
  child.stdout.on('data', (chunk) => {
    const match = String(chunk).match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
});
let token = '';
const call = async (path, method = 'GET', payload) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
};
try {
  token = (await call('/api/login', 'POST', { username: 'admin', password: 'admin' })).token;
  const expectedVenueId = (await call('/api/floor')).venueId;
  const zone = await call('/api/floor/zones', 'POST', { expectedVenueId, name: 'QA зал' });
  const table = await call('/api/floor/tables', 'POST', { expectedVenueId, zoneId: zone.id, name: 'Стол QA', capacity: 4 });
  await call('/api/shifts', 'POST', { openingCash: 0 });
  const order = await call('/api/orders', 'POST', { tableId: table.id });
  const list = async () => (await call('/api/orders?scope=all')).items.find((item) => item.id === order.id);
  assert.equal((await list()).tableName, 'Стол QA', 'journal receives a human-readable table name');
  await call(`/api/floor/tables/${table.id}`, 'PATCH', { expectedVenueId, name: 'Стол QA 2' });
  assert.equal((await list()).tableName, 'Стол QA 2', 'journal follows current table name');
  assert.equal((await call('/api/orders?scope=all')).items.length, 1, 'list enrichment does not duplicate orders');
  console.log('ORDER JOURNAL TABLE MEMORY QA: PASS (existing table, rename, response-only enrichment)');
} finally {
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
}

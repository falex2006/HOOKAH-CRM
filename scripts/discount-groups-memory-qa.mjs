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
  const timer = setTimeout(() => reject(new Error('isolated memory server did not start')), 15_000);
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('exit', () => { clearTimeout(timer); reject(new Error('isolated memory server exited early')); });
  child.stdout.on('data', (chunk) => {
    const match = String(chunk).match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
});
let token = '';
const call = async (path, method = 'GET', body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
};
const expect = (response, status, error) => {
  assert.equal(response.status, status, JSON.stringify(response));
  if (error) assert.equal(response.data.error, error);
  return response.data;
};
try {
  const login = expect(await call('/api/login', 'POST', { username: 'admin', password: 'admin' }), 200);
  token = login.token;
  assert.ok(token);
  const original = expect(await call('/api/network/venues'), 200).items.find((venue) => venue.isCurrent);
  assert.ok(original);
  const first = expect(await call('/api/discount-groups', 'POST', { name: 'QA VIP', discountPercent: 5, depositMin: 1.25 }), 201);
  const second = expect(await call('/api/discount-groups', 'POST', { name: 'QA Regular' }), 201);
  assert.notEqual(first.id, second.id);
  expect(await call('/api/discount-groups', 'POST', { name: '  qa vip  ' }), 409, 'discount_group_name_exists');
  expect(await call(`/api/discount-groups/${second.id}`, 'PATCH', { name: 'qa vip' }), 409, 'discount_group_name_exists');
  expect(await call('/api/discount-groups', 'POST', { name: 'Too precise', depositMin: 1.005 }), 400, 'invalid_discount_group');
  expect(await call('/api/discount-groups', 'POST', { name: 'Too large', depositMin: 10_000_000_000 }), 400, 'invalid_discount_group');
  expect(await call(`/api/discount-groups/${first.id}`, 'PATCH', { active: false }), 200);
  expect(await call('/api/discount-groups', 'POST', { name: 'QA VIP' }), 409, 'discount_group_name_exists');
  assert.deepEqual(expect(await call('/api/discount-groups'), 200).items.map((item) => item.name), ['QA Regular']);
  assert.equal(expect(await call('/api/discount-groups?includeArchived=true'), 200).items.length, 2);

  const other = expect(await call('/api/network/venues', 'POST', { name: 'QA Other', city: 'Тюмень', address: 'Тестовая, 1' }), 201);
  expect(await call(`/api/network/venues/${other.id}/select`, 'POST'), 200);
  assert.equal(expect(await call('/api/discount-groups?includeArchived=true'), 200).items.length, 0);
  expect(await call(`/api/discount-groups/${first.id}`, 'PATCH', { name: 'Foreign edit' }), 404, 'discount_group_not_found');
  const otherGroup = expect(await call('/api/discount-groups', 'POST', { name: 'QA VIP' }), 201);
  assert.notEqual(otherGroup.id, first.id);
  expect(await call(`/api/network/venues/${original.id}/select`, 'POST'), 200);
  assert.equal(expect(await call('/api/discount-groups?includeArchived=true'), 200).items.length, 2);
  expect(await call(`/api/discount-groups/${otherGroup.id}`, 'PATCH', { active: false }), 404, 'discount_group_not_found');
  console.log('DISCOUNT GROUPS MEMORY QA: PASS (duplicate, archived, validation, sequential venue scope)');
} finally {
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
}

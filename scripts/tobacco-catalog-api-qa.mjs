import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reserve = net.createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const { port } = reserve.address();
await new Promise((resolve, reject) => reserve.close((error) => error ? reject(error) : resolve()));

const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: '', AUTH_REQUIRED: 'false', PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { logs += chunk; });
child.stderr.setEncoding('utf8').on('data', (chunk) => { logs += chunk; });
const base = `http://127.0.0.1:${port}`;
const request = async (route, method = 'GET', body) => {
  const response = await fetch(`${base}${route}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
let checks = 0;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`CRM server exited early (${child.exitCode}): ${logs}`);
    try { if ((await request('/api/health')).status === 200) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.equal(ready, true, `server did not become ready: ${logs}`); checks++;
  const beforeStock = await request('/api/inventory');
  const empty = await request('/api/tobacco-catalog');
  assert.equal(empty.status, 200); assert.deepEqual(empty.body.items, []); checks += 2;

  const network = await request('/api/tobacco-catalog', 'POST', { scope: 'organization', brand: 'QA Brand', productLine: 'Core', flavor: 'Berry Mint', productType: 'tobacco', packageGrams: 100, strength: 'Средняя', aliases: ['ягоды мята'] });
  assert.equal(network.status, 201); assert.equal(network.body.scope, 'organization'); assert.equal(network.body.venueId, null); checks += 3;
  const venue = await request('/api/tobacco-catalog', 'POST', { scope: 'venue', brand: 'Local QA', flavor: 'Grape', productType: 'tobacco_free', packageGrams: 50 });
  assert.equal(venue.status, 201); assert.equal(venue.body.scope, 'venue'); assert.ok(venue.body.venueId); checks += 3;
  const found = await request('/api/tobacco-catalog?q=ягоды');
  assert.equal(found.body.items.length, 1); assert.equal(found.body.items[0].id, network.body.id); checks += 2;
  const duplicate = await request('/api/tobacco-catalog', 'POST', { scope: 'organization', brand: 'qa brand', productLine: 'Core', flavor: 'Berry Mint', productType: 'tobacco', packageGrams: 100 });
  assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error, 'tobacco_catalog_duplicate'); checks += 2;
  const updated = await request(`/api/tobacco-catalog/${network.body.id}`, 'PATCH', { description: 'Информационная карточка', active: false });
  assert.equal(updated.status, 200); assert.equal(updated.body.active, false); assert.equal(updated.body.description, 'Информационная карточка'); checks += 2;
  assert.equal((await request('/api/tobacco-catalog')).body.items.length, 1); checks++;
  assert.equal((await request('/api/tobacco-catalog?status=archived')).body.items.length, 1); checks++;
  assert.equal((await request(`/api/tobacco-catalog/${network.body.id}`)).status, 200); checks++;
  const invalid = await request('/api/tobacco-catalog', 'POST', { scope: 'venue', brand: 'Bad', flavor: 'Bad', packageGrams: -2 });
  assert.equal(invalid.status, 400); checks++;
  const afterStock = await request('/api/inventory');
  assert.deepEqual(afterStock.body, beforeStock.body); checks++;
  process.stdout.write(`TOBACCO CATALOG API QA: PASS (${checks} assertions; empty/list/search/create organization+venue/archive/restore filtering/duplicate validation/informational-only inventory invariant)\n`);
} finally {
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(3000)]);
}

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 3217;
const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), AUTH_REQUIRED: 'false', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const request = async (path, options = {}) => { const response = await fetch(`http://127.0.0.1:${port}${path}`, options); const payload = await response.json(); assert.equal(response.ok, true, `${path}: ${response.status} ${JSON.stringify(payload)}`); return payload; };
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 800); child.once('error', reject); child.once('exit', (code) => code && reject(new Error(`server exited ${code}`))); });
  const created = await request('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Проверка пустой базы', description: 'Smoke', priority: 'high' }) });
  assert.equal(created.title, 'Проверка пустой базы');
  const listed = await request('/api/tasks'); assert.ok(listed.items.some((task) => task.id === created.id));
  const updated = await request(`/api/tasks/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) });
  assert.equal(updated.status, 'done');
  console.log('TASKS QA: 3 checks passed');
} finally { child.kill('SIGTERM'); }

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: '', AUTH_REQUIRED: 'false', DEMO_MODE: 'false', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Preferences QA server did not start: ${output}`)), 15000);
    child.once('error', reject);
    child.stdout.on('data', () => {
      const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  const login = async (username, password) => {
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data.token;
  };
  const first = await login('admin', 'admin');
  const second = await login('admin', 'admin');
  const api = async (token, method = 'GET', body) => {
    const response = await fetch(`${base}/api/session/preferences`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data.preferences;
  };
  await api(first, 'PATCH', { theme: 'light' });
  await api(second, 'PATCH', { financeMetrics: { median: false } });
  for (const token of [first, second]) {
    const preferences = await api(token);
    assert.equal(preferences.theme, 'light', 'different session must see theme');
    assert.equal(preferences.financeMetrics.median, false, 'different session must see finance choice');
  }
  await api(first, 'PATCH', { dashboardModules: { quick: false } });
  await api(second, 'PATCH', { dashboardModules: { staff: false } });
  const merged = await api(first);
  assert.equal(merged.dashboardModules.quick, false, 'nested PATCH retains first key');
  assert.equal(merged.dashboardModules.staff, false, 'nested PATCH retains second key');
  await Promise.all([
    api(first, 'PATCH', { financeMetrics: { revenue: false } }),
    api(second, 'PATCH', { financeMetrics: { average: false } }),
  ]);
  const simultaneous = await api(second);
  assert.equal(simultaneous.financeMetrics.median, false);
  assert.equal(simultaneous.financeMetrics.revenue, false);
  assert.equal(simultaneous.financeMetrics.average, false);
  for (const token of [first, second]) await fetch(`${base}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const staffToken = await login('staff', 'demo');
  const staffPreferences = await api(staffToken);
  assert.notEqual(staffPreferences.theme, 'light', 'different account cannot inherit admin theme');
  console.log('PASS preference merges across two sessions and isolates accounts');
} finally {
  child.kill();
}

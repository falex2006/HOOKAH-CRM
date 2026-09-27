import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const adminPassword = process.env.DEMO_ADMIN_PASSWORD || 'admin';
const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  windowsHide: true,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: '',
    AUTH_REQUIRED: 'true',
    DEMO_ADMIN_PASSWORD: adminPassword,
    DEMO_OWNER_PASSWORD: process.env.DEMO_OWNER_PASSWORD || 'demo',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let baseUrl = '';
let adminToken = '';
const createdStaffIds = [];

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: response.status, data };
};

const expectStatus = (response, expected, label) => {
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, got ${response.status} ${JSON.stringify(response.data)}`);
};

const startServer = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('isolated role matrix server did not start')), 15_000);
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('exit', () => { clearTimeout(timer); reject(new Error('isolated role matrix server exited before readiness')); });
  child.stdout.on('data', (chunk) => {
    const match = String(chunk).match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
});

try {
  baseUrl = await startServer();
  expectStatus(await request('/api/inventory'), 401, 'unauthenticated inventory read');

  const adminLogin = await request('/api/login', { method: 'POST', body: { username: 'admin', password: adminPassword } });
  expectStatus(adminLogin, 200, 'admin login');
  adminToken = adminLogin.data.token;

  const createAccount = async (role, login) => {
    const created = await request('/api/staff', {
      method: 'POST', token: adminToken,
      body: { name: `Role matrix ${role}`, login, password: 'qa-pass-123', role, birthDate: '1990-01-01' },
    });
    expectStatus(created, 201, `admin creates ${role}`);
    createdStaffIds.push(created.data.id);
    const authenticated = await request('/api/login', { method: 'POST', body: { username: login, password: 'qa-pass-123' } });
    expectStatus(authenticated, 200, `${role} login`);
    return { token: authenticated.data.token, user: authenticated.data.user };
  };

  const bartender = await createAccount('bartender', `qa_bartender_${suffix}`);
  const manager = await createAccount('manager', `qa_manager_${suffix}`);

  // Read route matrix follows the actual sidebar destinations plus their data APIs.
  const reads = [
    ['/api/orders', 200, 200],
    ['/api/floor', 200, 200],
    ['/api/reservations', 403, 200],
    ['/api/clients', 200, 200],
    ['/api/inventory', 403, 200],
    ['/api/finance/summary', 200, 200],
    ['/api/metrics', 200, 200],
    ['/api/shifts', 200, 200],
    ['/api/staff', 403, 200],
    ['/api/tasks', 200, 200],
  ];
  for (const [path, bartenderStatus, managerStatus] of reads) {
    expectStatus(await request(path, { token: bartender.token }), bartenderStatus, `bartender GET ${path}`);
    expectStatus(await request(path, { token: manager.token }), managerStatus, `manager GET ${path}`);
  }

  const bartenderFinance = await request('/api/finance/summary', { token: bartender.token });
  assert.equal(bartenderFinance.data.employeeView, true, 'operational employee gets the limited finance view');
  assert.deepEqual(Object.keys(bartenderFinance.data).sort(), ['date', 'employeeView', 'revenue'].sort(), 'employee finance payload contains turnover only');
  const employeeMetrics = await request('/api/metrics', { token: bartender.token });
  assert.equal(employeeMetrics.data.employeeView, true);
  assert.ok(Object.keys(employeeMetrics.data).every((key) => ['employeeView', 'openOrders', 'pendingOrders'].includes(key)), 'employee metrics exclude venue financial, stock and staffing indicators');
  for (const key of ['pendingRevenue', 'closedOrders', 'discountRequests', 'staffActive', 'reservationsToday', 'lowStock']) assert.ok(!(key in employeeMetrics.data), `employee metrics omit ${key}`);
  const managerMetrics = await request('/api/metrics', { token: manager.token });
  assert.ok('pendingRevenue' in managerMetrics.data && 'staffActive' in managerMetrics.data, 'manager retains management indicators');

  const oldShift = await request('/api/shifts', { method: 'POST', token: adminToken, body: { openingCash: 50 } });
  expectStatus(oldShift, 201, 'admin opens historical test shift');
  expectStatus(await request(`/api/shifts/${encodeURIComponent(oldShift.data.id)}/close`, { method: 'POST', token: adminToken, body: { closingCash: 60, checklistConfirmed: true } }), 200, 'admin closes historical test shift');
  const currentShift = await request('/api/shifts', { method: 'POST', token: adminToken, body: { openingCash: 25 } });
  expectStatus(currentShift, 201, 'admin opens current test shift');
  const employeeShifts = await request('/api/shifts', { token: bartender.token });
  assert.deepEqual(employeeShifts.data.items.map((shift) => shift.id), [currentShift.data.id], 'employee sees only current open shift');
  assert.deepEqual(Object.keys(employeeShifts.data.current).sort(), ['closedAt', 'id', 'openedAt', 'openingCash'].sort(), 'employee shift omits reconciliation fields');
  const managerShifts = await request('/api/shifts', { token: manager.token });
  assert.ok(managerShifts.data.items.some((shift) => shift.id === oldShift.data.id && 'cashVariance' in shift), 'manager retains historical cash reconciliation');
  const managerSession = await request('/api/session', { token: manager.token });
  assert.ok(managerSession.data.permissions.includes('inventory_read'));
  assert.ok(managerSession.data.permissions.includes('finance_read'));
  assert.ok(!managerSession.data.permissions.includes('inventory'));
  assert.ok(!managerSession.data.permissions.includes('finance'));

  // A visible/guessable URL or forged body must not bypass server-side checks.
  const forbiddenWrites = [
    ['/api/inventory/items', 'POST', { name: 'Forbidden QA item', unit: 'шт', itemType: 'ingredient', cost: 1 }],
    ['/api/expenses', 'POST', { amount: 1, category: 'QA', description: 'Forbidden write' }],
    ['/api/staff', 'POST', { name: 'Forbidden QA staff', login: `qa_denied_${suffix}`, password: 'qa-pass-123', role: 'bartender', birthDate: '1990-01-01' }],
    ['/api/venue', 'PATCH', { name: 'Forbidden venue rename' }],
  ];
  for (const [path, method, body] of forbiddenWrites) {
    expectStatus(await request(path, { method, token: bartender.token, body }), 403, `bartender ${method} ${path}`);
  }
  expectStatus(await request('/api/venue', { method: 'PATCH', token: manager.token, body: { name: 'Manager rename attempt' } }), 403,
    'manager settings scope cannot change venue identity');

  // Managers can assign a task; its assignee can change status but not rewrite its content.
  const task = await request('/api/tasks', {
    method: 'POST', token: manager.token,
    body: { title: `Role matrix task ${suffix}`, description: 'QA task', priority: 'normal', assigneeId: bartender.user.id },
  });
  expectStatus(task, 201, 'manager creates and assigns task');
  const employeeTasks = await request('/api/tasks', { token: bartender.token });
  assert.ok(employeeTasks.data.items.some((item) => item.id === task.data.id), 'assignee can read their task');
  expectStatus(await request(`/api/tasks/${encodeURIComponent(task.data.id)}`, {
    method: 'PATCH', token: bartender.token, body: { title: 'Unauthorized rewrite' },
  }), 403, 'assignee cannot edit manager-owned task fields');
  const completed = await request(`/api/tasks/${encodeURIComponent(task.data.id)}`, {
    method: 'PATCH', token: bartender.token, body: { status: 'done' },
  });
  expectStatus(completed, 200, 'assignee marks task done');
  assert.equal(completed.data.status, 'done');
  const reread = await request('/api/tasks', { token: manager.token });
  assert.equal(reread.data.items.find((item) => item.id === task.data.id)?.status, 'done', 'task status persists and is visible to manager');

  console.log('ROLE API MATRIX RUNTIME QA: PASS (unauthenticated denial; 10 read routes × bartender/manager; redacted employee metrics and shift history; 5 forbidden writes; employee finance payload; task assignment, constrained update and reread)');
} finally {
  if (baseUrl && adminToken) {
    for (const id of createdStaffIds) {
      await request(`/api/staff/${encodeURIComponent(id)}`, { method: 'DELETE', token: adminToken }).catch(() => {});
    }
  }
  child.kill();
  await once(child, 'exit').catch(() => {});
}

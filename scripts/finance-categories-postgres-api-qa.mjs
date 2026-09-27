import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated PostgreSQL QA database');
assert.match(new URL(databaseUrl).pathname, /(?:test|qa|scratch)/i, 'refusing test writes outside a clearly named QA database');

const require = createRequire(import.meta.url);
const { Client, Pool } = require('pg');
const setup = new Client({ connectionString: databaseUrl });
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const categoryStart = server.indexOf("if (pathname === '/api/finance/categories' && req.method === 'GET')");
const categoryEnd = server.indexOf("if (pathname === '/api/metrics')", categoryStart);
const expenseStart = server.indexOf("if (pathname === '/api/expenses' && req.method === 'GET')");
const expenseEnd = server.indexOf("if (pathname === '/api/payroll/rules' && req.method === 'POST')", expenseStart);
assert.ok(categoryStart >= 0 && categoryEnd > categoryStart, 'finance category API handlers are present');
assert.ok(expenseStart >= 0 && expenseEnd > expenseStart, 'finance expense API handlers are present');
const categoryRoute = server.slice(categoryStart, categoryEnd);
const expenseRoute = server.slice(expenseStart, expenseEnd);
const audit = [];

let venueId;
let otherVenueId;
const callApi = async ({ route, path, method = 'GET', body = {}, permissions = ['finance'], venue = venueId }) => {
  let response;
  const url = new URL(`http://localhost${path}`);
  const pathname = url.pathname;
  const json = (_res, status, data) => { response = { status, data }; return response; };
  const hasPermission = (req, permission) => req.user?.permissions?.includes(permission) === true;
  const denyUnless = (req, res, permission) => {
    if (hasPermission(req, permission)) return false;
    json(res, 403, { error: 'forbidden', permission }); return true;
  };
  const denyUnlessAny = (req, res, required) => {
    if (required.some((permission) => hasPermission(req, permission))) return false;
    json(res, 403, { error: 'forbidden', permissions: required }); return true;
  };
  const repositories = { pool };
  const routeToday = () => '2026-09-28';
  const handler = new Function('pathname','url','req','res','repositories','venueDbId','denyUnlessAny','denyUnless','hasPermission','body','json','recordAudit','financeCategories','manualExpenses','isOperationalEmployee','today',
    `return (async()=>{${route}})();`);
  await handler(pathname, url, { method, headers: {}, user: { id: null, name: 'QA finance', role: 'owner', permissions } }, {}, repositories, venue,
    denyUnlessAny, denyUnless, hasPermission, async () => body, json,
    (_req, action, entityType, entityId, beforeData, afterData) => { audit.push({ action, entityType, entityId, beforeData, afterData }); },
    [], [], () => false, routeToday);
  return response;
};

const originalAuthRequired = process.env.AUTH_REQUIRED;
process.env.AUTH_REQUIRED = 'true';
let setupConnected = false;
try {
  await setup.connect();
  setupConnected = true;
  venueId = (await setup.query("INSERT INTO venues (name) VALUES ('Finance categories QA') RETURNING id")).rows[0].id;
  otherVenueId = (await setup.query("INSERT INTO venues (name) VALUES ('Finance category tenant QA') RETURNING id")).rows[0].id;

  const created = await callApi({ route: categoryRoute, path: '/api/finance/categories', method: 'POST', body: { name: 'Коммунальные расходы', kind: 'expense' } });
  assert.equal(created.status, 201, JSON.stringify(created));
  const categoryId = created.data.id;
  assert.equal(created.data.kind, 'expense');
  assert.equal((await callApi({ route: categoryRoute, path: '/api/finance/categories', method: 'POST', body: { name: 'коммунальные расходы', kind: 'expense' } })).status, 409,
    'active category names are case-insensitively unique per venue and type');
  assert.equal((await callApi({ route: categoryRoute, path: '/api/finance/categories?includeArchived=true', permissions: ['finance_read'] })).status, 403,
    'view-only finance users cannot inspect the archived category catalog');

  const expense = await callApi({ route: expenseRoute, path: '/api/expenses', method: 'POST', body: {
    categoryId, amount: 1750.5, expenseDate: '2026-09-28', description: 'QA-generated expense', source: 'manual',
  } });
  assert.equal(expense.status, 201, JSON.stringify(expense));
  assert.equal(expense.data.category, 'Коммунальные расходы');
  assert.equal(expense.data.category_id, categoryId);
  const invalidAssignment = await callApi({ route: expenseRoute, path: '/api/expenses', method: 'POST', body: { categoryId: '00000000-0000-4000-8000-000000000001', amount: 10, expenseDate: '2026-09-28' } });
  assert.equal(invalidAssignment.status, 400, 'expenses cannot select an unknown or inactive category');

  const withUsage = await callApi({ route: categoryRoute, path: '/api/finance/categories' });
  assert.equal(withUsage.data.items.find((item) => item.id === categoryId).operationCount, 1);
  const renamed = await callApi({ route: categoryRoute, path: `/api/finance/categories/${categoryId}`, method: 'PATCH', body: { name: 'Коммунальные услуги' } });
  assert.equal(renamed.status, 200);
  const historicalExpense = await setup.query('SELECT category,category_id AS "categoryId" FROM expenses WHERE id=$1 AND venue_id=$2', [expense.data.id, venueId]);
  assert.equal(historicalExpense.rows[0].category, 'Коммунальные услуги', 'renaming a referenced category updates the linked expense snapshot in one transaction');
  assert.equal(historicalExpense.rows[0].categoryId, categoryId);
  assert.equal((await callApi({ route: categoryRoute, path: `/api/finance/categories/${categoryId}`, method: 'PATCH', body: { kind: 'income' } })).status, 409,
    'a category linked to expenses cannot change into an income category');

  const archived = await callApi({ route: categoryRoute, path: `/api/finance/categories/${categoryId}`, method: 'PATCH', body: { active: false } });
  assert.equal(archived.status, 200);
  assert.equal(archived.data.active, false);
  assert.deepEqual((await callApi({ route: categoryRoute, path: '/api/finance/categories' })).data.items, [], 'archived categories are omitted from expense assignment');
  const archivedList = await callApi({ route: categoryRoute, path: '/api/finance/categories?includeArchived=true' });
  assert.equal(archivedList.data.items.find((item) => item.id === categoryId).operationCount, 1, 'archive preserves and exposes historical operation count');
  assert.equal((await callApi({ route: expenseRoute, path: '/api/expenses', method: 'POST', body: { categoryId, amount: 10, expenseDate: '2026-09-28' } })).status, 400,
    'archived categories cannot be assigned to new expenses');
  assert.equal((await callApi({ route: categoryRoute, path: `/api/finance/categories/${categoryId}`, venue: otherVenueId, method: 'PATCH', body: { active: true } })).status, 404,
    'another venue cannot restore this category');
  const restored = await callApi({ route: categoryRoute, path: `/api/finance/categories/${categoryId}`, method: 'PATCH', body: { active: true } });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.active, true);
  assert.equal((await callApi({ route: categoryRoute, path: '/api/finance/categories' })).data.items.length, 1);

  const legacy = await setup.query("INSERT INTO expenses (venue_id,category,amount,expense_date,source) VALUES ($1,'Старая категория',5,'2026-09-28','other') RETURNING category_id", [venueId]);
  assert.equal(legacy.rows[0].category_id, null, 'legacy and non-catalog expense rows remain valid without guessing category links');
  assert.ok(audit.some((event) => event.entityType === 'finance_category' && event.action === 'finance_category.created'));
  console.log('FINANCE CATEGORIES POSTGRES API QA: PASS (durable CRUD, expense linkage/history, operation counts, archive/restore, role and venue isolation)');
} finally {
  if (originalAuthRequired === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = originalAuthRequired;
  if (setupConnected) await setup.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [[venueId, otherVenueId].filter(Boolean)]).catch(() => {});
  await setup.end();
  await pool.end();
}

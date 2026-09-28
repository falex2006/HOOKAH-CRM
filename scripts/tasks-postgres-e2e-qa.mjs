import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { assertQaDatabaseIdentity, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
const target = validateQaDatabaseUrl(databaseUrl, 'MIGRATIONS_PG_TEST_DATABASE_URL');

const require = createRequire(import.meta.url);
const { Client, Pool } = require('pg');
const setup = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 5000 });
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf("if (pathname === '/api/tasks' && req.method === 'GET')");
const end = source.indexOf("if (pathname === '/api/reservations' && req.method === 'GET')", start);
assert.ok(start >= 0 && end > start, 'task API handlers are available');
const route = source.slice(start, end);

const suffix = `${process.pid}-${Date.now()}`;
const venues = [];
const users = [];
let setupConnected = false;
const identities = {};

const callApi = async ({ venueId, user, path = '/api/tasks', method = 'GET', body = {} }) => {
  let response;
  const url = new URL(`http://localhost${path}`);
  const pathname = url.pathname;
  const json = (_res, status, data) => { response = { status, data }; return response; };
  const hasPermission = (req, permission) => req.user?.permissions?.includes(permission) === true;
  const denyUnlessAny = (req, res, required) => {
    if (required.some((permission) => hasPermission(req, permission))) return false;
    json(res, 403, { error: 'forbidden', permissions: required }); return true;
  };
  const handler = new Function('pathname','req','res','url','repositories','venueDbId','denyUnlessAny','hasPermission','body','json','recordAudit','tasks','staff',
    `return (async()=>{${route}})();`);
  await handler(pathname, { method, user }, {}, url, { pool }, venueId, denyUnlessAny, hasPermission,
    async () => body, json, () => {}, [], [],
  );
  return response;
};

const staffPermissions = ['orders'];
const managerPermissions = ['tasks_manage', 'staff_view'];

try {
  await setup.connect();
  setupConnected = true;
  const { rows: identityRows } = await setup.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
    inet_server_port() AS port, COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false) AS superuser`);
  assertQaDatabaseIdentity(identityRows[0], target.database, Number(target.url.port || 5432), 'MIGRATIONS_PG_TEST_DATABASE_URL');
  console.log(`Verified isolated PostgreSQL QA target: ${target.database} (${identityRows[0].address}:${identityRows[0].port})`);

  const createVenue = async (name) => {
    const id = (await setup.query('INSERT INTO venues (name) VALUES ($1) RETURNING id', [name])).rows[0].id;
    venues.push(id);
    return id;
  };
  const createUser = async (venueId, name, role, label) => {
    const login = `tasks-qa-${label}-${suffix}`;
    const id = (await setup.query('INSERT INTO users (venue_id,full_name,login,role) VALUES ($1,$2,$3,$4) RETURNING id', [venueId,name,login,role])).rows[0].id;
    users.push(id);
    return { id, name, role };
  };

  const venueId = await createVenue(`Tasks chain QA ${suffix}`);
  const otherVenueId = await createVenue(`Tasks chain tenant QA ${suffix}`);
  const manager = await createUser(venueId, 'Tasks QA Manager', 'manager', 'manager');
  const employeeA = await createUser(venueId, 'Tasks QA Employee A', 'bartender', 'employee-a');
  const employeeB = await createUser(venueId, 'Tasks QA Employee B', 'bartender', 'employee-b');
  const otherManager = await createUser(otherVenueId, 'Tasks QA Other Manager', 'manager', 'other-manager');
  const identity = (person, permissions) => ({ id: person.id, name: person.name, role: person.role, permissions });

  const dueAt = '2026-09-29T18:00:00.000Z';
  const assignedA = await callApi({ venueId, user: identity(manager, managerPermissions), method: 'POST', body: {
    title: 'Проверить готовность зала', description: 'До открытия смены', priority: 'high', assigneeId: employeeA.id, dueAt,
  } });
  assert.equal(assignedA.status, 201, JSON.stringify(assignedA));
  assert.equal(assignedA.data.assigneeId, employeeA.id);
  assert.equal(assignedA.data.status, 'open');
  assert.equal(new Date(assignedA.data.dueAt).toISOString(), dueAt);

  const assignedB = await callApi({ venueId, user: identity(manager, managerPermissions), method: 'POST', body: {
    title: 'Проверить барную станцию', assigneeId: employeeB.id,
  } });
  assert.equal(assignedB.status, 201, JSON.stringify(assignedB));

  const employeeATasks = await callApi({ venueId, user: identity(employeeA, staffPermissions) });
  assert.equal(employeeATasks.status, 200);
  assert.deepEqual(employeeATasks.data.items.map((task) => task.id), [assignedA.data.id], 'employee A sees only the task assigned to A');

  const employeeBTasks = await callApi({ venueId, user: identity(employeeB, staffPermissions) });
  assert.equal(employeeBTasks.status, 200);
  assert.deepEqual(employeeBTasks.data.items.map((task) => task.id), [assignedB.data.id], 'employee B sees only the task assigned to B');

  const deniedReadByUnrelatedPermission = await callApi({ venueId, user: identity(employeeA, []) });
  assert.equal(deniedReadByUnrelatedPermission.status, 403, 'task listing requires orders or staff-view access');

  const deniedChangeByB = await callApi({ venueId, user: identity(employeeB, staffPermissions), path: `/api/tasks/${assignedA.data.id}`, method: 'PATCH', body: { status: 'done' } });
  assert.equal(deniedChangeByB.status, 403, 'another employee cannot change A\'s task');

  const completedByA = await callApi({ venueId, user: identity(employeeA, staffPermissions), path: `/api/tasks/${assignedA.data.id}`, method: 'PATCH', body: { status: 'done' } });
  assert.equal(completedByA.status, 200, JSON.stringify(completedByA));
  assert.equal(completedByA.data.status, 'done');

  const managerTasks = await callApi({ venueId, user: identity(manager, managerPermissions) });
  assert.equal(managerTasks.status, 200);
  assert.equal(managerTasks.data.items.find((task) => task.id === assignedA.data.id)?.status, 'done', 'manager sees the employee\'s persisted completion');
  const storedTask = await setup.query('SELECT status,assignee_id AS "assigneeId",venue_id AS "venueId" FROM tasks WHERE id=$1', [assignedA.data.id]);
  assert.equal(storedTask.rowCount, 1);
  assert.equal(storedTask.rows[0].status, 'done', 'completion is persisted in PostgreSQL');
  assert.equal(storedTask.rows[0].assigneeId, employeeA.id);
  assert.equal(storedTask.rows[0].venueId, venueId);

  const otherVenueTasks = await callApi({ venueId: otherVenueId, user: identity(otherManager, managerPermissions) });
  assert.equal(otherVenueTasks.status, 200);
  assert.deepEqual(otherVenueTasks.data.items, [], 'a different venue cannot list tasks from this venue');
  const crossTenantPatch = await callApi({ venueId: otherVenueId, user: identity(otherManager, managerPermissions), path: `/api/tasks/${assignedA.data.id}`, method: 'PATCH', body: { status: 'cancelled' } });
  assert.equal(crossTenantPatch.status, 404, 'a different venue cannot mutate this task by ID');
  const unchangedAfterCrossTenantAttempt = await setup.query('SELECT status FROM tasks WHERE id=$1', [assignedA.data.id]);
  assert.equal(unchangedAfterCrossTenantAttempt.rows[0].status, 'done', 'cross-tenant attempt leaves task unchanged');

  console.log('TASKS POSTGRES E2E QA: PASS (manager assignment, employee-scoped reads, assignee completion, manager reread, durable PostgreSQL status, tenant isolation)');
} finally {
  await pool.end();
  if (setupConnected) {
    if (venues.length) {
      await setup.query('DELETE FROM tasks WHERE venue_id = ANY($1::uuid[])', [venues]).catch(() => {});
      await setup.query('DELETE FROM audit_events WHERE venue_id = ANY($1::uuid[])', [venues]).catch(() => {});
    }
    if (users.length) await setup.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]).catch(() => {});
    if (venues.length) await setup.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venues]).catch(() => {});
    await setup.end();
  }
}

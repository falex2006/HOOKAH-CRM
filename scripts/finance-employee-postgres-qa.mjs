import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated PostgreSQL QA database');
assert.match(new URL(databaseUrl).pathname, /(?:test|qa|scratch)/i,
  'refusing writes unless the database name clearly identifies test/QA/scratch');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const scrypt = promisify(scryptCallback);
const client = new Client({ connectionString: databaseUrl });
const venueId = randomUUID();
const employeeId = randomUUID();
const coworkerId = randomUUID();
const login = 'finance-employee-qa-' + venueId;
const password = 'qa-' + randomUUID() + '-' + randomUUID();
const timezone = 'Pacific/Kiritimati';
const processTimezone = 'Etc/GMT+12';
let server;
let output = '';
let baseUrl = '';
let token = '';
let checks = 0;

const passwordSalt = randomBytes(16).toString('hex');
const passwordDerived = await scrypt(password, passwordSalt, 64);
const passwordHash = 'scrypt$' + passwordSalt + '$' + passwordDerived.toString('hex');

const request = async (route, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body;
  const auth = options.auth === undefined ? token : options.auth;
  const response = await fetch(baseUrl + route, {
    method,
    headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: response.status, data };
};

const deleteSyntheticRows = async () => {
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM auth_sessions WHERE user_id IN ($1,$2)', [employeeId, coworkerId]);
    await client.query('DELETE FROM audit_events WHERE venue_id=$1', [venueId]);
    await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE venue_id=$1)', [venueId]);
    await client.query('DELETE FROM orders WHERE venue_id=$1', [venueId]);
    await client.query('DELETE FROM users WHERE venue_id=$1', [venueId]);
    await client.query('DELETE FROM venues WHERE id=$1', [venueId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
};

try {
  await client.connect();
  await client.query('INSERT INTO venues (id,name,timezone) VALUES ($1,$2,$3)', [venueId, 'QA finance ' + venueId, timezone]);
  await client.query('INSERT INTO users (id,venue_id,full_name,login,password_hash,role,permission_scopes,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,true),($8,$2,$9,$10,NULL,$6,$7::jsonb,true)',
    [employeeId, venueId, 'QA Finance Employee', login, passwordHash, 'bartender', '[]', coworkerId, 'QA Finance Coworker', login + '-coworker']);

  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      HOST: '127.0.0.1', PORT: '0', DATABASE_URL: databaseUrl,
      VENUE_ID: venueId, AUTH_REQUIRED: 'true', COOKIE_SECURE: 'false',
      NODE_ENV: 'test', API_RATE_LIMIT: '5000', BUSINESS_TIMEZONE: processTimezone,
      PGOPTIONS: '-c timezone=UTC',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });

  const waitUntil = Date.now() + 20000;
  while (!baseUrl && Date.now() < waitUntil) {
    const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) baseUrl = 'http://127.0.0.1:' + match[1];
    else if (server.exitCode !== null) throw new Error('isolated AUTH_REQUIRED PostgreSQL API failed to start: ' + output);
    else await delay(50);
  }
  assert.ok(baseUrl, 'isolated API server starts: ' + output);

  const health = await request('/api/health', { auth: '' });
  assert.equal(health.status, 200);
  assert.equal(health.data.database, 'postgres', 'test uses real PostgreSQL repositories'); checks++;

  const loginResult = await request('/api/login', { method: 'POST', auth: '', body: { username: login, password } });
  assert.equal(loginResult.status, 200, 'synthetic bartender login succeeds: ' + JSON.stringify(loginResult.data));
  token = loginResult.data.token;
  assert.ok(token, 'login returns a persisted-session token');
  assert.ok(loginResult.data.permissions.includes('finance_read'));
  assert.ok(!loginResult.data.permissions.includes('finance'), 'employee cannot receive full finance permission'); checks += 3;

  const session = await request('/api/session');
  assert.equal(session.status, 200);
  assert.equal(session.data.user.id, employeeId, 'subsequent request resolves user through persistent auth_sessions');
  assert.equal(session.data.user.role, 'bartender'); checks += 2;

  const businessDate = (await client.query('SELECT (now() AT TIME ZONE $1)::date::text AS date', [timezone])).rows[0].date;
  const previousDate = (await client.query('SELECT ($1::date - 1)::text AS date', [businessDate])).rows[0].date;
  const expectedRevenue = 150;
  const ownToday = (await client.query('INSERT INTO orders (venue_id,opened_by,status,closed_at) VALUES ($1,$2,$3,(($4::date::timestamp + INTERVAL \'12 hours\') AT TIME ZONE $5)) RETURNING id',
    [venueId, employeeId, 'closed', businessDate, timezone])).rows[0].id;
  await client.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,$4),($1,$5,$6,$7)',
    [ownToday, 'cash', 120, 'paid', 'card', 30, 'partially_paid']);
  const ownPrior = (await client.query('INSERT INTO orders (venue_id,opened_by,status,closed_at) VALUES ($1,$2,$3,(($4::date::timestamp + INTERVAL \'12 hours\') AT TIME ZONE $5)) RETURNING id',
    [venueId, employeeId, 'closed', previousDate, timezone])).rows[0].id;
  await client.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,$4)', [ownPrior, 'cash', 700, 'paid']);
  const coworkerToday = (await client.query('INSERT INTO orders (venue_id,opened_by,status,closed_at) VALUES ($1,$2,$3,(($4::date::timestamp + INTERVAL \'12 hours\') AT TIME ZONE $5)) RETURNING id',
    [venueId, coworkerId, 'closed', businessDate, timezone])).rows[0].id;
  await client.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,$4)', [coworkerToday, 'cash', 900, 'paid']);

  const forgedDate = '2000-01-01';
  const summary = await request('/api/finance/summary?date=' + forgedDate);
  assert.equal(summary.status, 200, 'employee finance summary works: ' + JSON.stringify(summary.data));
  assert.deepEqual(Object.keys(summary.data).sort(), ['date','employeeView','revenue'].sort(), 'summary exposes revenue only');
  assert.equal(summary.data.employeeView, true);
  assert.equal(summary.data.date, businessDate, 'summary ignores forged date and uses venue-local current date');
  assert.equal(summary.data.revenue, expectedRevenue, 'summary excludes coworker and prior-day sales'); checks += 5;

  const report = await request('/api/finance/report?date=' + forgedDate + '&type=waiter');
  assert.equal(report.status, 200, 'employee finance report works: ' + JSON.stringify(report.data));
  assert.deepEqual(Object.keys(report.data).sort(), ['type','date','generatedAt','reportNumber','checksCount','revenue','employeeView'].sort(),
    'report exposes no payment methods, staff, shift details or full report data');
  assert.equal(report.data.type, 'x', 'employee cannot request waiter/Z report variants');
  assert.equal(report.data.date, businessDate, 'report ignores forged date and uses venue-local current date');
  assert.equal(report.data.checksCount, 1);
  assert.equal(report.data.revenue, expectedRevenue, 'report is scoped to employee and current venue-local date'); checks += 6;

  console.log('FINANCE EMPLOYEE POSTGRES QA: PASS (' + checks + ' checks; persisted login/session; venue-local date; forged date ignored; employee-only revenue summary and X report)');
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once('exit', resolve)).catch(() => {});
  }
  if (client._connected) await deleteSyntheticRows();
  await client.end().catch(() => {});
}

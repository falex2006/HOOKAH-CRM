import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { canTransitionPayroll, calculatePayrollAmount, countInclusiveDays, isValidIsoDate } from '../payroll.js';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated PostgreSQL test database');
assert.match(new URL(databaseUrl).pathname, /(?:test|qa|scratch)/i,
  'refusing test writes unless the database name clearly identifies a test/QA/scratch database');

const require = createRequire(import.meta.url);
const { Client, Pool } = require('pg');
const setup = new Client({ connectionString: databaseUrl });
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf('const payrollEntryPath = pathname.match(');
const end = source.indexOf("if (pathname === '/api/inventory/auto-orders'", start);
assert.ok(start >= 0 && end > start, 'payroll entry API handlers are available');
const route = source.slice(start, end);
let venueId = null;
let userId = null;

const callApi = async ({ path = '/api/payroll/entries', method = 'GET', body = {}, query = '' }) => {
  let response;
  const pathname = path;
  const result = await new Function('pathname','req','res','url','repositories','venueDbId','denyUnless','body','json','recordAudit','today','isValidIsoDate','countInclusiveDays','calculatePayrollAmount','canTransitionPayroll',
    `return (async()=>{${route}})();`)(
    pathname, { method, user: { id: userId, name: 'Payroll QA' } }, {}, new URL(`http://local${path}${query}`),
    { pool }, venueId, () => false, async () => body,
    (_res, status, data) => { response = { status, data }; return response; }, () => {}, () => '2026-09-27',
    isValidIsoDate, countInclusiveDays, calculatePayrollAmount, canTransitionPayroll,
  );
  return response || result;
};

try {
  await setup.connect();
  venueId = (await setup.query("INSERT INTO venues (name,timezone) VALUES ('Isolated payroll API QA','Asia/Yekaterinburg') RETURNING id")).rows[0].id;
  userId = (await setup.query(`INSERT INTO users (venue_id,full_name,login,role)
    VALUES ($1,'Payroll QA','payroll-qa-${process.pid}','bartender') RETURNING id`, [venueId])).rows[0].id;
  const ruleId = (await setup.query(`INSERT INTO payroll_rules (venue_id,name,rule_type,rate)
    VALUES ($1,'QA hourly','hourly',500) RETURNING id`, [venueId])).rows[0].id;
  await setup.query(`INSERT INTO staff_work_logs (venue_id,user_id,started_at,ended_at,source)
    VALUES ($1,$2,'2026-09-21T05:00:00Z','2026-09-21T13:00:00Z','manual')`, [venueId, userId]);

  const createPayload = { userId, ruleId, periodFrom: '2026-09-01', periodTo: '2026-09-30', amount: 999999 };
  const draft = await callApi({ method: 'POST', body: createPayload });
  assert.equal(draft.status, 201);
  assert.equal(draft.data.status, 'draft');
  assert.equal(draft.data.hours, 8);
  assert.equal(draft.data.amount, 4000, 'payroll uses actual work logs and ignores caller-supplied amount');
  const retriedDraft = await callApi({ method: 'POST', body: createPayload });
  assert.equal(retriedDraft.status, 201);
  assert.equal(retriedDraft.data.id, draft.data.id, 'repeating the same draft request updates one row');

  const entryPath = `/api/payroll/entries/${draft.data.id}`;
  const approved = await callApi({ path: entryPath, method: 'PATCH', body: { action: 'approve' } });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, 'approved');
  const overlappingDraft = await callApi({ method: 'POST', body: { userId, ruleId, periodFrom: '2026-09-15', periodTo: '2026-10-15' } });
  assert.equal(overlappingDraft.status, 201);
  const overlapAttempt = await callApi({ path: `/api/payroll/entries/${overlappingDraft.data.id}`, method: 'PATCH', body: { action: 'approve' } });
  assert.equal(overlapAttempt.status, 409);
  assert.equal(overlapAttempt.data.error, 'payroll_period_overlap');

  const paid = await callApi({ path: entryPath, method: 'PATCH', body: { action: 'pay', paymentDate: '2026-09-27' } });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.status, 'paid');
  assert.ok(paid.data.expense_id, 'payment links the payroll entry to its cashflow expense');
  const replay = await callApi({ path: entryPath, method: 'PATCH', body: { action: 'pay', paymentDate: '2026-09-27' } });
  assert.equal(replay.status, 409, 'paid entries cannot create a second salary expense');
  const expense = await setup.query("SELECT id,amount,source,expense_date,description FROM expenses WHERE venue_id=$1 AND source='payroll'", [venueId]);
  assert.equal(expense.rowCount, 1);
  assert.equal(Number(expense.rows[0].amount), 4000);
  assert.equal(expense.rows[0].source, 'payroll');
  assert.equal(expense.rows[0].description, 'Выплата зарплаты за 01.09.2026 — 30.09.2026', 'payroll period uses full Russian calendar dates rather than JavaScript Date text');
  assert.equal((await setup.query('SELECT expense_id,status FROM payroll_entries WHERE id=$1', [draft.data.id])).rows[0].expense_id, expense.rows[0].id);

  const cancelled = await callApi({ path: `/api/payroll/entries/${overlappingDraft.data.id}`, method: 'PATCH', body: { action: 'cancel', reason: 'QA draft cancellation' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.status, 'cancelled');
  const listing = await callApi({ query: '?from=2026-09-01&to=2026-10-31' });
  assert.equal(listing.status, 200);
  assert.deepEqual(listing.data.items.map((item) => item.status).sort(), ['cancelled', 'paid']);

  console.log('PAYROLL POSTGRES API QA: PASS (real work logs → calculated draft → approve → overlap guard → one linked salary expense → cancel/list)');
} finally {
  await pool.end();
  if (setup._connected) {
    if (venueId) {
      await setup.query('DELETE FROM expenses WHERE venue_id=$1', [venueId]).catch(() => {});
      await setup.query('DELETE FROM payroll_entries WHERE venue_id=$1', [venueId]).catch(() => {});
      await setup.query('DELETE FROM staff_work_logs WHERE venue_id=$1', [venueId]).catch(() => {});
      await setup.query('DELETE FROM payroll_rules WHERE venue_id=$1', [venueId]).catch(() => {});
      if (userId) await setup.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
      await setup.query('DELETE FROM venues WHERE id=$1', [venueId]).catch(() => {});
    }
    await setup.end();
  }
}

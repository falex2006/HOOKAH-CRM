import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portal = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const start = portal.indexOf('className = \'panel finance-payroll-panel\'');
const end = portal.indexOf('const optionMap = { revenue:', start);
assert.ok(start >= 0 && end > start, 'finance page contains an isolated payroll register block');
const ui = portal.slice(start, end);

for (const id of [
  'payroll-filter-from', 'payroll-filter-to', 'payroll-filter-user', 'payroll-filter-rule',
  'payroll-create-form', 'payroll-create-user', 'payroll-create-rule', 'payroll-register', 'payroll-message',
]) assert.ok(ui.includes(`id="${id}"`), `register exposes ${id}`);
assert.match(ui, /api\(`\/api\/payroll\/entries\?from=/, 'register reads date-filtered rows from the server API');
assert.match(ui, /await api\('\/api\/payroll\/entries', \{ method: 'POST'/, 'create action persists an actual draft through the server API');
assert.match(ui, /await api\(`\/api\/payroll\/entries\/\$\{encodeURIComponent\(entryId\)\}`, \{ method: 'PATCH'[\s\S]*?JSON\.stringify\(payload\)/, 'status actions persist to the server and do not update local mock state');
for (const action of ['approve', 'pay', 'cancel']) assert.ok(ui.includes(`data-payroll-action="${action}"`), `${action} action is available in its valid lifecycle state`);
assert.match(ui, /item\.status === 'draft'[\s\S]*?item\.status === 'approved'[\s\S]*?Операция завершена/, 'terminal entries are rendered without mutation controls');
assert.match(ui, /loadPayroll\(\), loadExpenses\(\), load\(\)/, 'transitions refresh register, expense ledger, and analytics');
assert.match(ui, /Черновик нельзя создать в демо-режиме|зарплатные начисления не подменяются тестовыми данными/, 'demo mode never pretends to have a working payroll backend');
assert.match(ui, /Изменение не сохранено|Ничего не сохранено/, 'API errors are shown as failures, never success');
assert.match(ui, /Сумма начисления рассчитывается автоматически по выбранной модели оплаты и данным за период/, 'creation explains that all rule types calculate the amount from period data');
assert.doesNotMatch(ui, /payroll-create-amount|payload\.amount|ручных моделей оплаты|Для почасовой модели сумма рассчитывается/, 'the UI never requests or submits a manual payroll amount');
assert.match(ui, /data-payroll-cancel-editor[\s\S]*?data-payroll-cancel-reason/, 'cancellation uses an inline reason editor');
assert.match(ui, /textarea[^>]*minlength="3" maxlength="500"[^>]*required/, 'reason editor enforces backend-compatible length limits');
assert.match(ui, /reason\.length < 3 \|\| reason\.length > 500/, 'client rejects cancellation reasons outside 3–500 characters');
assert.doesNotMatch(ui, /window\.prompt/, 'cancellation does not rely on a native browser prompt');

// Treat these as required backend contracts: this test must fail until the API
// work is present, instead of allowing a UI-only change to appear complete.
assert.match(server, /pathname === '\/api\/payroll\/entries' && req\.method === 'GET'/,
  'backend implements GET /api/payroll/entries before the UI can be considered integrated');
assert.ok(server.includes('pathname.match(/^\\/api\\/payroll\\/entries\\/([^/]+)$/)'),
  'backend implements the payroll entry transition route');
assert.match(server, /payrollEntryPath[\s\S]*?req\.method === 'PATCH'[\s\S]*?action/,
  'backend validates payroll transition actions');
assert.match(server, /pathname === '\/api\/payroll\/entries' && req\.method === 'POST'/,
  'backend supports draft creation used by the form');

console.log('PAYROLL REGISTER UI CONTRACT: PASS (presentation + API integration contracts)');

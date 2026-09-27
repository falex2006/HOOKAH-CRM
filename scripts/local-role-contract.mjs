import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');

const roles = {
  bartender: { required: ['floor', 'orders'], forbidden: ['finance', 'inventory'] },
  hookah_master: { required: ['floor', 'orders'], forbidden: ['finance', 'inventory'] },
  senior_bartender: { required: ['floor', 'orders', 'bar_tasks'], forbidden: ['finance', 'inventory'] },
  senior_hookah_master: { required: ['floor', 'orders', 'hookah_tasks'], forbidden: ['finance', 'inventory'] },
  admin: { required: ['floor', 'orders', 'finance', 'inventory', 'staff_manage'], forbidden: [] },
  manager: { required: ['floor', 'orders', 'staff_view', 'tasks_manage', 'loyalty'], forbidden: ['staff_manage', 'finance'] },
  owner: { required: ['floor', 'orders', 'finance', 'inventory', 'staff_sensitive'], forbidden: [] },
  developer: { required: ['floor', 'orders', 'finance_read', 'inventory_read', 'diagnostics'], forbidden: ['finance', 'inventory'] },
  platform_owner: { required: ['platform', 'diagnostics'], forbidden: ['finance', 'inventory', 'orders'] }
};
assert.match(server, /if \(pathname === '\/api\/session'\)[\s\S]*?const user = req\.user \|\| persistedSession\?\.user \|\| \{ name: 'Демо сотрудник', role: 'bartender' \}/);
assert.doesNotMatch(server, /url\.searchParams\.get\('role'\)/, 'session role must come from the authenticated account, never the URL');
for (const role of ['bartender', 'hookah_master', 'senior_bartender', 'senior_hookah_master']) {
  const declaration = portal.match(new RegExp(`${role}: new Set\\(\\[([^\\]]+)\\]\\)`))?.[1] || '';
  assert.doesNotMatch(declaration, /staff_view/, `${role} UI must not expose personnel navigation without API permission`);
}
assert.match(portal, /bartender: new Set\(\['dashboard', 'floor', 'orders', 'bar_tasks', 'finance_read'\]\)/);
assert.match(portal, /hookah_master: new Set\(\['dashboard', 'floor', 'orders', 'hookah_tasks', 'finance_read'\]\)/);
assert.match(server, /manager: \['floor', 'orders', 'reservations', 'inventory_read', 'finance_read', 'staff_view', 'tasks_manage', 'settings', 'loyalty'\]/);
assert.match(server, /pathname === '\/api\/payroll\/rules' && req\.method === 'GET'[\s\S]*?denyUnless\(req, res, 'finance'\)/,
  'payroll rates are restricted to the finance permission, not operational turnover or staff directory access');
assert.match(server, /pathname === '\/api\/expenses' && req\.method === 'GET'[\s\S]*?denyUnless\(req, res, 'finance'\)/,
  'operating expenses and payroll amounts require finance permission');
assert.match(server, /const permissionScopes = \[[^\]]*'loyalty'\]/);
assert.match(server, /loyalty: \['loyalty'\]/);
assert.match(server, /hasPermission\(req, 'loyalty'\)\) return json\(res, 403, \{ error: 'forbidden', permission: 'loyalty' \}\)/);
assert.match(server, /const ownTasksOnly = Boolean\(req\.user && !hasPermission\(req, 'staff_manage'\) && !hasPermission\(req, 'tasks_manage'\)\)/);
assert.match(server, /denyUnlessAny\(req, res, \['staff_manage', 'tasks_manage'\]\)/);
assert.match(server, /task_assignee_required/);
assert.match(portal, /field\.type === 'select'[\s\S]*field\.options/);
assert.match(portal, /name: 'assigneeId', label: 'Ответственный сотрудник'/);
assert.match(server, /assignee_id=\$3/);
console.log(`LOCAL ROLE CONTRACT: PASS (${Object.keys(roles).length} role permission profiles; URL role override disabled)`);

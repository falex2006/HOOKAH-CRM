import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distApp = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const distHtml = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

assert.match(app, /const preserveWorkspaceRoute=\(href\)=>/);
assert.match(app, /queryParams\.delete\('mode'\)/);
assert.match(app, /next\.searchParams\.delete\('operator'\)/);
assert.match(app, /staff-guests-link.*preserveWorkspaceRoute\(['"]\/clients['"]\)/s);
assert.doesNotMatch(app, /operatorId|actingAccount|режим сотрудника/);

// The employee sidebar stays hidden until the authenticated session is read.
assert.equal([...html.matchAll(/<nav class="portal-nav" hidden aria-busy="true" data-session-pending="true">/g)].length, 2);
assert.match(app, /else fetch\('\/api\/session'/);
assert.match(app, /if\(!s\?\.user\)return/);
assert.match(app, /item\.hidden=!hasStaffPermission\(item\.dataset\.permission,permissions\)/,
  'every nav item must be both hidden when forbidden and restored when its permission is granted');

// Exercise the exact permission predicate used by the UI against the server's
// manager permission profile, including the inventory/finance read aliases.
const permissionHelper = app.match(/const staffPermissionAliases=\{[^;]+;\s*const hasStaffPermission=\(required,permissions\)=>[^;]+;/);
assert.ok(permissionHelper, 'the UI permission predicate must stay explicit and testable');
const hasStaffPermission = vm.runInNewContext(`${permissionHelper[0]}; hasStaffPermission`);
const managerPermissions = new Set(['floor', 'orders', 'reservations', 'inventory_read', 'finance_read', 'staff_view', 'tasks_manage', 'settings', 'loyalty']);
for (const permission of ['floor', 'orders', 'inventory_read', 'finance_read', 'loyalty']) {
  assert.equal(hasStaffPermission(permission, managerPermissions), true, `manager must see ${permission}`);
}
assert.equal(hasStaffPermission('inventory', managerPermissions), false, 'read-only manager must not get inventory write access');
assert.equal(hasStaffPermission('staff_manage', managerPermissions), false, 'manager must not get personnel-management access');
assert.match(app, /canOpenAdmin=\['owner','admin','manager','developer'\]/,
  'the manager must be able to open the management panel granted by the server role profile');
assert.match(app, /\.portal-nav:not\(\.staff-admin-nav\)/,
  'role-filtered employee sections must not hide the separate role-gated admin return link');
assert.match(app, /manager:\['floor','orders','reservations','inventory_read','finance_read','loyalty'\]/,
  'static demonstration role should mirror the manager navigation shape');

// Published assets must be exact copies, so a correct local fix cannot vanish
// or diverge on a static dist deployment.
assert.equal(distApp, app);
assert.equal(distHtml, html);
assert.match(html, /app\.js\?rev=128/);

console.log('STAFF SESSION NAVIGATION CONTRACT: PASS (server-driven permissions, manager links, fail-closed loading, root/dist parity)');

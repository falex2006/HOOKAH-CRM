import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const portal = await readFile(new URL('../portal.js', import.meta.url), 'utf8');
assert.doesNotMatch(app, /mode-switch-menu|crm_workspace_mode\.setItem|crm_workspace_mode\.getItem|\?operator=/);
assert.match(app, /fetch\('\/api\/session'/);
assert.match(app, /applyStaffHeader\(actor\)/);
assert.doesNotMatch(portal, /mode-switch-menu|staff-workspace|href: '\/\?mode=/);
assert.match(portal, /floor: '\/'/);
assert.match(portal, /href="\/admin"|href: '\/admin/);
assert.match(portal, /href="\/admin#settings"|href: '\/admin#settings'/);
assert.match(portal, /label: 'Зал'/);
assert.match(portal, /label: 'Журнал заказов'/);
assert.match(portal, /querySelectorAll\('\.portal-nav:not\(\.staff-nav\) a\[href="\/integrations"\]'\)/);
console.log('MODE NAVIGATION CONTRACT: PASS (mode persistence and clean admin return)');

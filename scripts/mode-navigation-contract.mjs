import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const portal = await readFile(new URL('../portal.js', import.meta.url), 'utf8');
assert.match(app, /crm_workspace_mode/);
assert.match(app, /new URL\(link\.href, location\.href\)/);
assert.match(app, /target\.pathname === '\/admin'/);
assert.match(app, /target\.pathname \+ target\.search \+ target\.hash/);
assert.match(portal, /mode-switch-menu/);
assert.match(portal, /href: '\/\?mode=staff'/);
assert.match(portal, /href="\/admin"|href: '\/admin/);
assert.match(portal, /href="\/admin#settings"|href: '\/admin#settings'/);
assert.match(portal, /label: 'Зал и заказы'/);
assert.match(portal, /label: 'Журнал заказов'/);
assert.match(portal, /querySelectorAll\('\.portal-nav:not\(\.staff-nav\) a\[href="\/integrations"\]'\)/);
console.log('MODE NAVIGATION CONTRACT: PASS (mode persistence and clean admin return)');

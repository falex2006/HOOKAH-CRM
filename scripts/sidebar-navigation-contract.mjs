import assert from 'node:assert/strict';
import fs from 'node:fs';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const tree = fs.readFileSync(new URL('../SITE_TREE.md', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../SITE_MAP.md', import.meta.url), 'utf8');
const staffHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const icons = fs.readFileSync(new URL('../assets/tabler-icons.svg', import.meta.url), 'utf8');

// A staff work contour is a real route variant, not a cosmetic label. The
// sidebar must preserve its query when deciding which item is active.
assert.match(portal, /const currentUrl = new URL\(location\.href\);/);
assert.match(portal, /const linkMode = linkUrl\.searchParams\.get\('mode'\);/);
assert.match(portal, /const currentMode = currentUrl\.searchParams\.get\('mode'\);/);
assert.match(portal, /const modeMatches = linkMode \? linkMode === currentMode : !linkMode;/);
assert.match(portal, /linkUrl\.pathname === currentPath && modeMatches && hashMatches/);
assert.match(portal, /href: '\/\?mode=staff'/);
assert.match(portal, /window\.addEventListener\('hashchange', \(\) => \{\s*normalizeManagementSidebar\(\);/s);

// Keep the canonical page tree aligned with the management sidebar's target
// pages, so adding a link cannot silently point at a non-canonical filename.
for (const route of ['/admin', '/orders', '/clients', '/reservations', '/inventory', '/finance']) {
  assert.ok(tree.includes(`| \`${route}\` |`), `tree missing ${route}`);
}
assert.match(portal, /href: '\/admin#settings'/);
assert.match(portal, /href: '\/integrations'/);
assert.match(portal, /\[\['ОПЕРАЦИИ', 'operations'\], \['КОНТРОЛЬ', 'control'\]\]/,
  'multi-link operational groups must use the same collapsible pattern');
assert.match(portal, /makeGroup\('КОМАНДА',[\s\S]*makeGroup\('СИСТЕМА'/,
  'team and system groups must remain in the shared disclosure pattern');
assert.match(portal, /crm_sidebar_group_/,
  'users should keep their sidebar disclosure preferences between page visits');
assert.match(portal, /group\.open = savedGroupState\(group\.dataset\.navGroup\) \?\? true/,
  'sidebar disclosure state must be restored exactly as the user left it');
assert.doesNotMatch(portal, /activeGroup\.open = true/,
  'loading a route must not override a saved collapsed group');
assert.match(portal, /mainNav\.after\(disclosureRoot\);\s*disclosureRoot\.replaceChildren\(\.\.\.\['operations', 'control', 'team', 'system'\]/,
  'all collapsible sidebar sections must share one ordered container and spacing system');
assert.match(portal, /summary\.innerHTML = `\$\{iconMarkup\(key === 'operations' \? 'clipboard-list' : 'chart-bar'\)\}<span>/,
  'compact icon navigation must expose accessible, recognizable group controls');

const operationOrder = [
  "{ href: '/?mode=staff', permission: 'floor', label: 'Зал', iconName: 'table-layout' }",
  "{ href: '/orders', permission: 'orders', label: 'Журнал заказов', iconName: 'receipt' }",
  "{ href: '/reservations', permission: 'reservations', label: 'Бронирования', iconName: 'calendar-event' }",
  "{ href: '/clients', permission: 'staff_view', label: 'Гости', iconName: 'users' }",
  "{ href: '/delivery', permission: 'delivery', label: 'Доставка', iconName: 'truck-delivery' }",
].map((entry) => portal.indexOf(entry));
assert.ok(operationOrder.every((position) => position >= 0), 'every operational route needs a semantic menu entry');
assert.deepEqual(operationOrder, [...operationOrder].sort((a, b) => a - b), 'operational menu order must follow the service flow');
assert.match(portal, /else \{ link\.dataset\.permission = item\.permission; link\.innerHTML = `\$\{iconMarkup\(item\.iconName\)\}<span>\$\{item\.label\}<\/span>`; \}/,
  'existing static links must be updated with the canonical permission, label and icon');
for (const entry of [
  "{ href: '/finance', permission: 'finance_read', label: 'Финансы', iconName: 'chart-bar' }",
  "{ href: '/admin#staff', permission: 'staff_view', label: 'Персонал', iconName: 'id-badge' }",
  "{ href: '/admin#tasks', permission: 'orders', label: 'Задачи', iconName: 'list-check' }",
  "{ href: '/admin#loyalty', permission: 'loyalty', label: 'Система лояльности', iconName: 'gift' }",
  "{ href: '/integrations', permission: 'integrations', label: 'Telegram', iconName: 'send' }",
]) assert.ok(portal.includes(entry), `missing semantic navigation mapping ${entry}`);
for (const symbol of ['table-layout', 'receipt', 'calendar-event', 'users', 'truck-delivery', 'package', 'chart-bar', 'id-badge', 'list-check', 'gift', 'settings', 'send']) {
  assert.ok(icons.includes(`<symbol id="${symbol}"`), `missing sidebar icon ${symbol}`);
}
assert.match(staffHtml, /tabler-icons\.svg\?rev=3#table-layout/);
assert.match(staffHtml, /tabler-icons\.svg\?rev=3#list-check/);
assert.match(staffHtml, /tabler-icons\.svg\?rev=3#gift/);
assert.match(map, /Зал\s+\/\?mode=staff[\s\S]*Журнал заказов[\s\S]*Бронирования[\s\S]*Гости[\s\S]*Доставка/);
assert.match(map, /Telegram\s+\/integrations/);

// Navigation text must not change weight when the active route changes.
assert.match(css, /\.velora-theme \.portal-sidebar \.portal-nav a\{[^}]*font-weight:500/);
assert.match(css, /\.velora-theme \.portal-sidebar \.portal-nav a\.active\{font-weight:500\}/);
assert.match(css, /@media \(min-width:1181px\) and \(max-width:1799px\)\{[\s\S]*?\.velora-theme \.portal-sidebar,\.staff-theme \.portal-sidebar\{width:clamp\(248px,16vw,280px\)/,
  'desktop sidebar must scale gently from readable laptop width to ultrawide width in both modes');
assert.match(css, /@media \(min-width:1800px\)\{\s*\.staff-theme \.portal-sidebar\{width:280px/,
  'staff sidebar must use the same deliberate width on full-screen ultrawide desktops');

console.log('SIDEBAR NAVIGATION CONTRACT: PASS (canonical routes and mode-aware active state)');

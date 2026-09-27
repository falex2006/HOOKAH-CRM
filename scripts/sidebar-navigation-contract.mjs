import assert from 'node:assert/strict';
import fs from 'node:fs';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const tree = fs.readFileSync(new URL('../SITE_TREE.md', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../SITE_MAP.md', import.meta.url), 'utf8');
const staffHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const icons = fs.readFileSync(new URL('../assets/tabler-icons.svg', import.meta.url), 'utf8');

// Every canonical CRM page must retain the shared navigation/header shell.
// Employee mode has its own header variant; platform and login use separate shells.
for (const file of [
  'admin.html', 'orders.html', 'clients.html', 'reservations.html',
  'delivery.html', 'inventory.html', 'finance.html', 'finance-report.html',
  'finance-categories.html', 'integrations.html', 'network.html',
]) {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(html, /class="portal-sidebar"/, `${file} must use the shared CRM sidebar`);
  assert.match(html, /class="portal-header"/, `${file} must use the shared CRM header`);
}
assert.match(staffHtml, /class="portal-sidebar"/, 'employee mode must retain the shared CRM sidebar');
assert.match(staffHtml, /<header>/, 'employee mode must retain its top header');
assert.match(css, /:root\{--crm-header-height:68px\}[\s\S]*?\.velora-theme \.portal-header\{height:var\(--crm-header-height\);min-height:var\(--crm-header-height\)\}[\s\S]*?\.staff-theme header\{height:var\(--crm-header-height\);min-height:var\(--crm-header-height\)\}/,
  'management and employee modes must use the same responsive header-height token');
assert.match(css, /@media\(max-width:650px\)\{\.velora-theme \.portal-app \.portal-header>\.header-context,\.velora-theme \.portal-shell \.portal-header>\.header-context\{box-sizing:border-box;margin-left:0;padding-left:50px/,
  'mobile breadcrumbs must reserve space for the menu toggle in both CRM shells');
assert.match(css, /@media\(min-width:901px\) and \(max-width:950px\)\{\.velora-theme \.portal-sidebar\{width:clamp\(228px,25vw,240px\)/,
  'expanded sidebar labels must retain readable space above the compact rail breakpoint');
assert.match(css, /\.velora-theme \.portal-header \.header-right > \.notification-bell[^}]*width:44px;height:44px/,
  'shared header action controls must use the common 44px touch target');
assert.match(css, /\.velora-theme \.portal-header\{padding:0 16px\}/,
  'admin header must have deliberate mobile side spacing');
assert.match(css, /\.staff-theme header\{padding:0 16px;align-items:center\}/,
  'employee header must have deliberate mobile side spacing');

// Staff work is the root route; identity and permissions come from the login.
assert.match(portal, /const currentUrl = new URL\(location\.href\);/);
assert.match(portal, /href: '\/'/);
assert.doesNotMatch(portal, /staff-workspace|href: '\/\?mode=/);
assert.match(portal, /const dashboardHashChangeHandler = \(\) => \{\s*normalizeManagementSidebar\(\);[\s\S]*?target\._dashboardHashChangeHandler = dashboardHashChangeHandler;\s*window\.addEventListener\('hashchange', dashboardHashChangeHandler\);/s,
  'dashboard hash navigation must normalize the sidebar through one replaceable listener');

// Keep the canonical page tree aligned with the management sidebar's target
// pages, so adding a link cannot silently point at a non-canonical filename.
for (const route of ['/admin', '/orders', '/clients', '/reservations', '/inventory', '/finance']) {
  assert.ok(tree.includes(`| \`${route}\` |`), `tree missing ${route}`);
}
assert.match(portal, /href: '\/admin#settings'/);
assert.match(portal, /href: '\/integrations'/);
assert.match(portal, /\[\['ОПЕРАЦИИ', 'operations'\]\]/,
  'multi-link operational groups must use the same collapsible pattern');
assert.match(portal, /const controlLabel = control\.previousElementSibling;[\s\S]*controlLabel\.textContent\.trim\(\) === 'КОНТРОЛЬ'[\s\S]*controlLabel\.remove\(\)/,
  'legacy standalone control caption must be removed when the control links move into disclosure groups');
assert.match(css, /@media\(max-width:900px\)\{\.velora-theme \.portal-sidebar\.is-expanded \.portal-nav a\{width:100%;justify-self:stretch;box-sizing:border-box\}\}/,
  'mobile drawer links must align to a shared full-width left edge regardless of label length');
for (const item of [
  "{ href: '/inventory?view=products', permission: 'inventory_read', label: 'Каталог товаров', iconName: 'layout-grid' }",
  "{ href: '/inventory?view=recipes', permission: 'inventory_read', label: 'Технологические карты', iconName: 'clipboard-list' }",
  "{ href: '/inventory?view=stock', permission: 'inventory_read', label: 'Остатки', iconName: 'package', navigationModule: 'inventory' }",
  "{ href: '/inventory?view=auto-orders', permission: 'inventory_read', label: 'Пополнение запасов', iconName: 'alert-triangle', navigationModule: 'inventory' }",
  "{ href: '/inventory?view=movements', permission: 'inventory_read', label: 'Поставки и списания', iconName: 'truck-delivery', navigationModule: 'inventory' }",
  "{ href: '/inventory?view=premixes', permission: 'inventory_read', label: 'Заготовки и премиксы', iconName: 'flask', navigationModule: 'inventory' }",
  "{ href: '/inventory?view=directories', permission: 'inventory_read', label: 'Цеха и категории', iconName: 'building', navigationModule: 'inventory' }",
]) assert.ok(portal.includes(item), `missing inventory navigation target ${item}`);
assert.match(portal, /ensureAreaGroup\('menu', 'МЕНЮ'/);
assert.match(portal, /ensureAreaGroup\('inventory', 'СКЛАД'/);
assert.match(portal, /ensureAreaGroup\('finance', 'ФИНАНСЫ',[\s\S]*href: '\/finance\/report'[\s\S]*href: '\/finance\/categories'/,
  'all finance destinations must render consistently as one navigation group');
assert.match(portal, /selectors = \{ inventory: 'a\[data-navigation-module="inventory"\]', finance: 'a\[data-navigation-module="finance"\]' \}/,
  'interface preferences must control all child links, not only the parent route');
assert.match(portal, /if \(navigation\[name\] === false\)[\s\S]*details\.sidebar-nav-group\[data-nav-group="\$\{name\}"\][\s\S]*group\.hidden = true/,
  'turning a section off must hide its disclosure heading as well as all child links');
assert.doesNotMatch(portal, /a\[href="\/network"\].*\.remove\(\)/,
  'the network destination must not be deleted during sidebar normalization');
assert.match(portal, /href: '\/network', permission: 'settings', label: 'Моя сеть'/);
assert.match(portal, /href: '\/admin#diagnostics', permission: 'diagnostics', label: 'Диагностика'/);
assert.match(portal, /makeGroup\('СИСТЕМА',[\s\S]*'\/network',[\s\S]*'\/admin#diagnostics'/,
  'network and developer diagnostics must stay reachable in their permitted roles');
assert.match(portal, /summary\?\.classList\.toggle\('has-active-child', Boolean\(activeLink\)\)/);
assert.match(portal, /window\.addEventListener\('popstate', \(\) => setInventoryView/);
assert.match(portal, /history\[historyMode \+ 'State'\]/);
assert.doesNotMatch(portal, /data-inventory-tab/, 'warehouse view navigation must have one visible source in the sidebar');
assert.match(portal, /makeGroup\('КОМАНДА',[\s\S]*makeGroup\('СИСТЕМА'/,
  'team and system groups must remain in the shared disclosure pattern');
assert.match(portal, /crm_sidebar_group_/,
  'users should keep their sidebar disclosure preferences between page visits');
assert.match(portal, /const rememberGroupState = \(details, key\) => \{[\s\S]*?summary\?\.setAttribute\('aria-expanded', String\(details\.open\)\)[\s\S]*?details\.dataset\.userToggle !== 'true'[\s\S]*?localStorage\.setItem\(groupStorageKey\(key\), details\.open \? 'open' : 'closed'\)/,
  'disclosures must expose their expanded state and only persist explicit user toggles');
assert.doesNotMatch(portal, /matchMedia\('\(max-width: 900px\)'\)[\s\S]{0,120}details\.open = true/,
  'compact viewports must allow navigation groups to collapse and remember their state');
assert.match(portal, /const defaultGroupOpen = \(key\) => \{[\s\S]*?return false;[\s\S]*?\};[\s\S]*?group\.open = savedGroupState\(group\.dataset\.navGroup\) \?\? defaultGroupOpen\(group\.dataset\.navGroup\)/,
  'sidebar groups must default to the current route and prefer an explicit saved choice');
assert.doesNotMatch(portal, /activeGroup\.open = true/,
  'loading a route must not override a saved collapsed group');
assert.doesNotMatch(portal, /activeGroup\?\.open[\s\S]{0,180}scrollIntoView/,
  'route normalization must not auto-scroll the sidebar away from its brand');
assert.match(portal, /mainNav\.after\(disclosureRoot\);\s*disclosureRoot\.replaceChildren\(\.\.\.\['operations', 'menu', 'inventory', 'finance', 'team', 'system'\]/,
  'all collapsible sidebar sections must share one ordered container and spacing system');
assert.match(portal, /summary\.innerHTML = `\$\{iconMarkup\(key === 'operations' \? 'clipboard-list' : 'chart-bar'\)\}<span>/,
  'compact icon navigation must expose accessible, recognizable group controls');

assert.match(portal, /toggle\.setAttribute\('aria-controls', sidebar\.id\)[\s\S]*?main\.inert = modalOpen[\s\S]*?backdrop\.addEventListener\('click'[\s\S]*?event\.key === 'Escape'[\s\S]*?syncToggle\(false, \{ restoreFocus: true \}\)[\s\S]*?event\.key !== 'Tab'[\s\S]*?sidebar\.addEventListener\('click'[\s\S]*?portal-nav a/,
  'phone drawer must support accessible state, outside/route close, Escape and background isolation');
assert.match(portal, /if \(opening && isDrawerViewport\(\)\) requestAnimationFrame\(\(\) => focusableInDrawer\(\)\[1\]/,
  'opening a compact-width drawer must move focus inside it');
assert.match(css, /@media\(max-width:650px\)\{[\s\S]*?\.portal-app>\.portal-main\{[^}]*flex:1 1 100%;width:100%[\s\S]*?\.sidebar-backdrop:not\(\[hidden\]\)\{position:fixed;z-index:55;inset:0;display:block;background:rgba\(4,7,11,\.7\)/,
  'phone drawer overlays the page without shrinking the main content');

const operationOrder = [
  "{ href: '/', permission: 'floor', label: 'Зал', iconName: 'table-layout' }",
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
  "{ href: '/finance', permission: 'finance_read', label: 'Обзор финансов', iconName: 'chart-bar', navigationModule: 'finance' }",
  "{ href: '/admin#staff', permission: 'staff_view', label: 'Персонал', iconName: 'id-badge' }",
  "{ href: '/admin#tasks', permission: 'orders', label: 'Задачи', iconName: 'list-check' }",
  "{ href: '/admin#loyalty', permission: 'loyalty', label: 'Система лояльности', iconName: 'gift' }",
  "{ href: '/integrations', permission: 'integrations', label: 'Telegram', iconName: 'send' }",
]) assert.ok(portal.includes(entry), `missing semantic navigation mapping ${entry}`);
for (const symbol of ['table-layout', 'receipt', 'clipboard-list', 'calendar-event', 'users', 'truck-delivery', 'package', 'chart-bar', 'cash', 'id-badge', 'list-check', 'gift', 'settings', 'send', 'layout-grid', 'building', 'alert-triangle']) {
  assert.ok(icons.includes(`<symbol id="${symbol}"`), `missing sidebar icon ${symbol}`);
}
assert.match(staffHtml, /tabler-icons\.svg\?rev=3#table-layout/);
assert.match(staffHtml, /tabler-icons\.svg\?rev=3#list-check/);
assert.match(staffHtml, /tabler-icons\.svg\?rev=3#gift/);
assert.match(map, /Зал\s+\/[\s\S]*Журнал заказов[\s\S]*Бронирования[\s\S]*Гости[\s\S]*Доставка/);
assert.match(map, /Telegram\s+\/integrations/);

// Navigation text must not change weight when the active route changes.
assert.match(css, /\.velora-theme \.portal-sidebar \.portal-nav a\{[^}]*font-weight:500/);
assert.match(css, /\.velora-theme \.portal-sidebar \.portal-nav a\.active\{font-weight:500\}/);
assert.match(css, /\.velora-theme \.portal-sidebar \.sidebar-nav-group \.portal-nav a\{[^}]*font-size:15px/,
  'nested sidebar labels use a consistent compact size to avoid unnecessary wrapping');
assert.match(css, /@media \(min-width:1181px\) and \(max-width:1799px\)\{[\s\S]*?\.velora-theme \.portal-sidebar,\.staff-theme \.portal-sidebar\{width:clamp\(210px,18vw,280px\)/,
  'desktop sidebar width must scale smoothly from the compact desktop breakpoint to ultrawide width in both modes');
assert.match(css, /@media \(min-width:651px\) and \(max-width:900px\)\{[\s\S]*?\.portal-sidebar\{position:fixed;z-index:25;left:0;top:0;bottom:0;width:280px;transform:translateX\(-100%\)/,
  'the Fold sidebar opens as an overlay and does not permanently consume workspace width');
assert.match(css, /\.portal-sidebar \.sidebar-nav-group>summary\{display:flex;min-height:44px/,
  'collapsed Fold navigation groups must match adjacent 44px touch targets');
assert.match(css, /@media\(max-width:900px\)\{\.staff-theme \.portal-sidebar\{width:68px/,
  'employee navigation uses a compact icon rail at Fold/tablet widths to preserve the order workspace');
assert.match(css, /@media \(min-width:1800px\)\{\s*\.staff-theme \.portal-sidebar\{width:280px/,
  'staff sidebar must use the same deliberate width on full-screen ultrawide desktops');

console.log('SIDEBAR NAVIGATION CONTRACT: PASS (canonical routes; authenticated identity controls permissions)');

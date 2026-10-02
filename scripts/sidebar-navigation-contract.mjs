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
assert.match(css, /@media\(max-width:650px\)\{\.staff-theme header\{[\s\S]*?\.staff-theme header>div:first-child>b\{[^}]*white-space:normal[^}]*\}/,
  'narrow POS header must wrap its title instead of clipping it beside shift status');
assert.match(css, /@media\(max-width:650px\)\{\.velora-theme \.portal-app \.portal-header>\.header-context,\.velora-theme \.portal-shell \.portal-header>\.header-context\{box-sizing:border-box;margin-left:0;padding-left:50px/,
  'mobile breadcrumbs must reserve space for the menu toggle in both CRM shells');
assert.match(css, /@media\(max-width:480px\)\{\s*:root\{--crm-header-height:112px\}[\s\S]*?\.velora-theme \.portal-app \.portal-header>\.header-context,\.velora-theme \.portal-shell \.portal-header>\.header-context\{[^}]*max-width:none;[^}]*padding-left:54px;[^}]*white-space:normal[\s\S]*?\.velora-theme \.portal-header>\.header-right\{flex:0 0 100%;width:100%/,
  'narrow phone headers must show the page title and actions on separate rows');
assert.match(css, /@media \(min-width:901px\) and \(max-width:1799px\)\{[\s\S]*?\.velora-theme \.portal-sidebar,\.staff-theme \.portal-sidebar\{width:clamp\(210px,18vw,280px\)/,
  'desktop sidebar width must use one continuous scale across laptop and wide desktop sizes');
assert.doesNotMatch(css, /@media\(min-width:901px\) and \(max-width:950px\)/,
  'sidebar must not jump at the 950/951px breakpoint');
const sidebarWidthAt = (viewport) => Math.min(280, Math.max(210, viewport * 0.18));
for (const [left, right] of [[949, 950], [950, 951], [951, 952], [1179, 1180], [1180, 1181]]) {
  assert.ok(Math.abs(sidebarWidthAt(right) - sidebarWidthAt(left)) < 1,
    `desktop sidebar width must remain continuous from ${left}px to ${right}px`);
}
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
const navigationStart = portal.indexOf('function setupPortalDashboardNavigation()');
const navigationEnd = portal.indexOf('function renderDashboard()', navigationStart);
assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, 'shared dashboard navigation helper exists');
const navigation = portal.slice(navigationStart, navigationEnd);
assert.match(navigation, /const navigate = \(\) => \{\s*normalizeManagementSidebar\(\);/,
  'dashboard hash navigation must normalize the sidebar before routing');
assert.match(navigation, /target\._portalDashboardNavigation\) return;/,
  'dashboard rerenders must retain only one shared navigation listener');
assert.match(navigation, /window\.addEventListener\('hashchange', navigate\);/,
  'dashboard hash navigation must use that single listener');

// Keep the canonical page tree aligned with the management sidebar's target
// pages, so adding a link cannot silently point at a non-canonical filename.
for (const route of ['/admin', '/orders', '/clients', '/reservations', '/inventory', '/finance']) {
  assert.ok(tree.includes(`| \`${route}\` |`), `tree missing ${route}`);
}
assert.match(portal, /href: '\/admin#settings'/);
assert.doesNotMatch(portal, /link\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*link\.href/,
  'native sidebar anchors must not trigger a second programmatic navigation');
assert.match(portal, /href: '\/integrations'/);
assert.match(portal, /\[\['Операции', 'operations'\]\]/,
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
assert.match(portal, /ensureAreaGroup\('menu', 'Меню'/);
assert.match(portal, /ensureAreaGroup\('inventory', 'Склад'/);
assert.match(portal, /ensureAreaGroup\('finance', 'Финансы',[\s\S]*href: '\/finance\/report'[\s\S]*href: '\/finance\/categories'/,
  'all finance destinations must render consistently as one navigation group');
assert.match(portal, /selectors = \{ inventory: 'a\[data-navigation-module="inventory"\]', finance: 'a\[data-navigation-module="finance"\]' \}/,
  'interface preferences must control all child links, not only the parent route');
assert.match(portal, /link\.hidden = !hasPortalLinkPermission\(link, permission\) \|\| navigation\[name\] === false;[\s\S]*refreshSidebarGroups\(\)/,
  'menu preference and role permission must both hide links and empty disclosure headings');
assert.match(portal, /window\.__applyInterfacePreferences\?\.\(\);/,
  'sidebar normalization must reapply preference visibility after replacing child links');
assert.match(portal, /companyPanel\.querySelectorAll\('\[data-interface-toggle\]'\)/,
  'permission filtering must target the panel that actually owns interface toggles');
assert.doesNotMatch(portal, /data-interface-toggle="discounts"/,
  'interface settings must not expose a switch for the removed discount sidebar link');
assert.doesNotMatch(portal, /a\[href="\/network"\].*\.remove\(\)/,
  'the network destination must not be deleted during sidebar normalization');
assert.match(portal, /href: '\/network', permission: 'settings', label: 'Моя сеть'/);
assert.match(portal, /href: '\/admin#diagnostics', permission: 'diagnostics', label: 'Диагностика'/);
assert.match(portal, /makeGroup\('Система',[\s\S]*'\/network',[\s\S]*'\/admin#diagnostics'/,
  'network and developer diagnostics must stay reachable in their permitted roles');
assert.match(portal, /summary\?\.classList\.toggle\('has-active-child', Boolean\(activeLink\)\)/);
assert.match(portal, /window\.addEventListener\('popstate', \(\) => setInventoryView/);
assert.match(portal, /history\[historyMode \+ 'State'\]/);
assert.doesNotMatch(portal, /data-inventory-tab/, 'warehouse view navigation must have one visible source in the sidebar');
assert.match(portal, /makeGroup\('Команда',[\s\S]*makeGroup\('Система'/,
  'team and system groups must remain in the shared disclosure pattern');
assert.match(portal, /crm_sidebar_disclosure_v2_[\s\S]*?portalUser\.venueId \|\| portalUser\.organizationId/,
  'disclosure preference is scoped to the authenticated user and tenant');
assert.match(portal, /const rememberGroupState = \(details, key\) => \{[\s\S]*?event\.preventDefault\(\)[\s\S]*?group\.open = shouldOpen && group === details[\s\S]*?localStorage\.setItem\(selection\.storageKey, JSON\.stringify/,
  'explicit summary activation opens at most one group and persists one route-bound selection');
assert.doesNotMatch(portal, /matchMedia\('\(max-width: 900px\)'\)[\s\S]{0,120}details\.open = true/,
  'compact viewports must allow navigation groups to collapse and remember their state');
assert.match(portal, /const defaultGroupOpen = \(key\) => \{[\s\S]*?return false;[\s\S]*?\};[\s\S]*?group\.open = !group\.hidden && \(savedGroupState\(group\.dataset\.navGroup\) \?\? defaultGroupOpen\(group\.dataset\.navGroup\)\)/,
  'sidebar groups must default to the current route and prefer an explicit saved choice');
assert.doesNotMatch(portal, /activeGroup\.open = true/,
  'loading a route must not override a saved collapsed group');
assert.doesNotMatch(portal, /if \(activeLink\) group\.open = true/,
  'an active route must not silently reopen a group that the user explicitly collapsed');
assert.match(portal, /summary\?\.classList\.toggle\('has-active-child', Boolean\(activeLink\)\)[\s\S]*?if \(activeLink\) summary\?\.setAttribute\('aria-current', 'location'\)/,
  'a collapsed group must still identify the section that contains the current route');
assert.match(portal, /const revealActiveSidebarLink = \(details\) => \{[\s\S]*?const scroller = details\.closest\('\.sidebar-nav-groups'\)[\s\S]*?const target = details\.open \? activeLink : details\.querySelector\(':scope > summary'\)[\s\S]*?scroller\.scrollTop/,
  'only an expanded group reveals its active child; a collapsed group reveals its summary inside the nav pane without opening');
assert.match(portal, /if \(!activeLink \|\| !target \|\| !scroller \|\| !target\.getClientRects\(\)\.length\) return;/,
  'resize and disclosure updates must not scroll unrelated collapsed groups over the active route');
assert.match(portal, /if \(activeLink\) requestAnimationFrame\(\(\) => revealActiveSidebarLink\(group\)\)/,
  'route normalization reveals the active child when expanded or the active group heading when collapsed');
assert.match(portal, /summary\.addEventListener\('click',[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?const rect = summary\.getBoundingClientRect\(\)/,
  'manual activation reveals the clicked summary without jumping to an unrelated active route');
assert.doesNotMatch(portal, /details\.addEventListener\('toggle',[\s\S]{0,170}revealActiveSidebarLink/,
  'automatic sibling toggle events do not pull the navigation viewport away from the clicked group');
assert.match(portal, /sidebar\._activeNavigationResizeHandler = \(\) => \{[\s\S]*?sidebar\.querySelectorAll\('details\.sidebar-nav-group'\)\.forEach\(revealActiveSidebarLink\)/,
  'the active target must remain visible when the viewport height changes');
assert.match(css, /\.portal\.velora-theme \.portal-sidebar>\.sidebar-nav-groups\{[\s\S]*?flex:1 1 0;[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto/,
  'navigation groups scroll in their own flexible pane while the brand, home and sign-out remain anchored');
assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.velora-theme \.portal-sidebar \.sidebar-nav-group>summary::after\{transition:none!important\}\}/,
  'sidebar disclosure indicators respect reduced-motion preferences');
assert.match(portal, /mainNav\.after\(disclosureRoot\);\s*disclosureRoot\.replaceChildren\(\.\.\.\['operations', 'menu', 'inventory', 'finance', 'team', 'system'\]/,
  'all collapsible sidebar sections must share one ordered container and spacing system');
assert.match(portal, /summary\.innerHTML = `\$\{iconMarkup\(key === 'operations' \? 'clipboard-list' : 'chart-bar'\)\}<span>/,
  'compact icon navigation must expose accessible, recognizable group controls');

assert.match(portal, /toggle\.setAttribute\('aria-controls', sidebar\.id\)[\s\S]*?main\.inert = modalOpen[\s\S]*?backdrop\.addEventListener\('click'[\s\S]*?event\.key === 'Escape'[\s\S]*?syncToggle\(false, \{ restoreFocus: true \}\)[\s\S]*?event\.key !== 'Tab'[\s\S]*?sidebar\.addEventListener\('click'[\s\S]*?portal-nav a/,
  'phone drawer must support accessible state, outside/route close, Escape and background isolation');
assert.match(portal, /if \(opening && isDrawerViewport\(\)\) requestAnimationFrame\(\(\) => focusableInDrawer\(\)\[1\]/,
  'opening a compact-width drawer must move focus inside it');
assert.match(css, /@media\(max-width:650px\)\{[\s\S]*?\.portal-app>\.portal-main\{[^}]*flex:1 1 100%;width:100%[\s\S]*?\.sidebar-backdrop:not\(\[hidden\]\)\{position:fixed;z-index:55;inset:0;display:block;background:rgba\(4,7,11,\.56\)/,
  'phone drawer overlays the page gently without shrinking the main content');
assert.match(css, /sidebar-mobile-toggle\{[^}]*width:44px;height:44px/,
  'the compact navigation toggle keeps a finger-friendly 44px target');
assert.match(css, /sidebar-mobile-toggle\[aria-expanded="true"\]\{left:calc\(min\(280px,100vw - 48px\) - 58px\);top:calc\(10px \+ env\(safe-area-inset-top\)\)/,
  'the drawer close control stays aligned to the actual drawer edge and device safe area');

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
assert.match(portal, /const activeLink = group\.querySelector\('a\.active'\);[\s\S]*?summary\?\.classList\.toggle\('has-active-child', Boolean\(activeLink\)\)[\s\S]*?summary\?\.setAttribute\('aria-current', 'location'\)/,
  'a collapsed group must remain visibly identified when it contains the active route');
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
assert.match(css, /\.velora-theme \.portal-sidebar \.sidebar-nav-group \.portal-nav a\{[^}]*gap:0;[^}]*padding:0 13px 0 37px/,
  'desktop child links align text under the disclosure group caption');
assert.match(css, /\.velora-theme \.portal-sidebar \.sidebar-nav-group \.portal-nav a>\.icon\{display:none\}/,
  'expanded child links do not repeat decorative icons already represented by the group heading');
assert.match(css, /@media\(max-width:900px\)\{[\s\S]*?\.portal-sidebar\.is-expanded \.sidebar-nav-group>summary \.icon\{display:block\}[\s\S]*?\.portal-sidebar\.is-expanded \.sidebar-nav-group \.portal-nav a\{gap:0;padding-left:39px\}/,
  'drawer keeps one icon at the group heading and aligns text-only children beneath its caption');
assert.match(css, /@media \(min-width:901px\) and \(max-width:1799px\)\{[\s\S]*?\.velora-theme \.portal-sidebar,\.staff-theme \.portal-sidebar\{width:clamp\(210px,18vw,280px\)/,
  'desktop sidebar width must scale smoothly from the compact desktop breakpoint to ultrawide width in both modes');
assert.match(css, /@media \(min-width:651px\) and \(max-width:900px\)\{[\s\S]*?\.portal-sidebar\{position:fixed;z-index:25;left:0;top:0;bottom:0;width:280px;transform:translateX\(-100%\)/,
  'the Fold sidebar opens as an overlay and does not permanently consume workspace width');
assert.match(css, /\.portal-sidebar \.sidebar-nav-group>summary\{display:flex;min-height:44px/,
  'collapsed Fold navigation groups must match adjacent 44px touch targets');
assert.match(css, /\.velora-theme \.portal-sidebar,\.staff-theme \.portal-sidebar\{position:sticky;top:0;align-self:flex-start;height:100vh;max-height:100vh;overflow-y:auto;overflow-x:hidden;z-index:10;scrollbar-width:none/,
  'both CRM sidebars preserve vertical scrolling and prevent horizontal scrolling without visible scrollbar chrome');
assert.match(css, /\.velora-theme \.portal-sidebar::\-webkit-scrollbar,\.staff-theme \.portal-sidebar::\-webkit-scrollbar\{width:0;height:0;display:none\}/,
  'Chromium sidebar scrollbar chrome is hidden without disabling overflow');
assert.match(css, /\.portal\.velora-theme \.portal-sidebar>\.sidebar-nav-groups\{[^}]*overflow-y:auto;[^}]*overflow-x:hidden;[^}]*scrollbar-width:none/s,
  'long administrative navigation groups remain scrollable without a nested scrollbar strip');
assert.match(css, /@media\(max-width:900px\)\{\.staff-theme \.portal-sidebar\{width:68px/,
  'employee navigation uses a compact icon rail at Fold/tablet widths to preserve the order workspace');
assert.match(css, /@media \(min-width:1800px\)\{\s*\.staff-theme \.portal-sidebar\{width:280px/,
  'staff sidebar must use the same deliberate width on full-screen ultrawide desktops');

console.log('SIDEBAR NAVIGATION CONTRACT: PASS (canonical routes; authenticated identity controls permissions)');

// Canonical sidebar audit additions.
const requiredLabels = [
  'Рабочий зал', 'Заказы', 'Гости', 'Бронирования', 'Доставка',
  'Каталог товаров', 'Технологические карты', 'Остатки', 'Пополнение запасов',
  'Поставки и списания', 'Заготовки и премиксы', 'Цеха и категории',
  'Обзор финансов', 'Отчёты', 'Категории доходов и расходов', 'Персонал',
  'Роли и права доступа', 'Задачи', 'Настройки заведения', 'Настройки модулей',
  'Безопасность', 'Журнал действий', 'Уведомления', 'Интеграции', 'Моя сеть',
  'Диагностика', 'Помощь',
];
for (const label of requiredLabels) assert.ok(portal.includes(`label: '${label}'`), `sidebar label missing: ${label}`);
for (const href of ['/','/orders','/clients','/reservations','/delivery','/inventory?view=products','/inventory?view=recipes','/inventory?view=stock','/inventory?view=auto-orders','/inventory?view=movements','/inventory?view=premixes','/inventory?view=directories','/finance','/finance/report','/finance/categories','/admin#staff','/admin#permissions','/admin#tasks','/admin#company','/admin#settings-dashboard-modules','/admin#lock-security','/admin#audit','/admin#notifications','/integrations','/network','/admin#diagnostics','/admin#help']) {
  assert.ok(portal.includes(`href: '${href}'`), `sidebar route missing: ${href}`);
}
assert.ok(portal.includes('const refreshSidebarCounters = () =>'), 'sidebar counters exist');
for (const source of ['/api/metrics', '/api/notifications?limit=1&filter=unread', '/api/shifts', '/api/integrations']) assert.ok(portal.includes(`api('${source}')`), `sidebar indicator source missing: ${source}`);
assert.match(portal, /localStorage\.setItem\(groupStorageKey\(key\)/, 'group state is stored per user');
assert.match(portal, /summary\.setAttribute\('aria-expanded'/, 'groups expose aria-expanded');
assert.match(portal, /link\.setAttribute\('aria-current', 'page'\)/, 'active links expose aria-current');
assert.match(portal, /sidebar-menu-search/, 'menu search exists');
console.log(`SIDEBAR NAVIGATION CONTRACT: PASS (${requiredLabels.length} labels, 26 routes, attention indicators and accessibility hooks)`);

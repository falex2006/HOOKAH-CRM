import fs from 'node:fs';
import assert from 'node:assert/strict';

const pages = [
  ['admin.html', 'admin/index.html'], ['orders.html', 'orders/index.html'],
  ['clients.html', 'clients/index.html'], ['reservations.html', 'reservations/index.html'],
  ['delivery.html', 'delivery/index.html'], ['inventory.html', 'inventory/index.html'],
  ['finance.html', 'finance/index.html'], ['finance-report.html', 'finance/report/index.html'],
  ['finance-categories.html', 'finance/categories/index.html'],
  ['integrations.html', 'integrations/index.html'], ['network.html', 'network/index.html'],
];
const shell = fs.readFileSync('header-shell.js', 'utf8');
const portal = fs.readFileSync('portal.js', 'utf8');
const notifications = fs.readFileSync('notification-center.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const lock = fs.readFileSync('lock.js', 'utf8');
const icons = fs.readFileSync('assets/tabler-icons.svg', 'utf8');

for (const [file] of pages) {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<header class="portal-header">/, `${file}: portal header exists`);
  assert.match(html, /src="\/header-shell\.js\?rev=\d+"><\/script><script src="\/lock\.js/, `${file}: shared header initializes before lock controls`);
  assert.match(html, /data-user-name/, `${file}: profile remains bound to session data`);
}
for (const file of ['orders.html', 'delivery.html', 'integrations.html']) {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<body class="portal velora-theme portal-page"/, `${file}: legacy route uses the shared drawer/scroll shell`);
}

assert.match(shell, /header\.dataset\.shellReady = 'true'/, 'header normalization is idempotent');
assert.match(shell, /bell\.setAttribute\('aria-label', 'Уведомления'\)/, 'bell has one accessible meaning');
assert.match(notifications, /notificationBell\?\.setAttribute\('aria-controls', 'notification-panel'\)/, 'bell controls the notification tray');
assert.match(notifications, /notificationPanel\.setAttribute\('role', 'dialog'\)/, 'notification tray has dialog semantics');
assert.match(shell, /shift\.dataset\.shiftState = 'loading'/, 'shift starts in a truthful loading state');
assert.match(shell, /actions\.replaceChildren\(\.\.\.ordered\)/, 'header actions use one predictable order');
assert.ok(notifications.includes('api(`/api/notifications?limit=20&filter=${notificationFilter}`'), 'tray loads its list and unread count from one server endpoint');
assert.ok(notifications.includes('api(`/api/notifications/${encodeURIComponent(id)}/read`'), 'single notification read state is saved on the server');
assert.ok(notifications.includes("api('/api/notifications', { method: 'POST'"), 'mark-all read is a server action');
assert.doesNotMatch(notifications, /territory_crm_seen_(?:manager|discount)_notifications/, 'read state is not stored in shared browser-local keys');
assert.match(notifications, /notificationChannel\?\.addEventListener\('message'/, 'read updates refresh other tabs');
assert.match(server, /notification_reads/, 'server persists per-user read receipts');
assert.match(server, /req\.user\.id, notificationId/, 'single-read API binds state to authenticated session user');
assert.match(server, /venue_id=\$1 AND d\.status='requested'/, 'notification source queries are scoped to active venue');
assert.match(notifications, /event\.key === 'Escape'[\s\S]*?closeNotificationPanel\(\)/, 'Escape closes the tray and returns focus');
assert.match(css, /prefers-reduced-motion:reduce\).*notification-panel/, 'tray respects reduced-motion preference');
assert.match(css, /\.notification-panel\{position:fixed/, 'notification tray is positioned independently from page flow');
assert.match(css, /@media\(max-width:768px\)\{[\s\S]*?\.notification-panel\{inset:0/, 'tablet and mobile tray uses a full-screen surface');
assert.match(portal, /header-shift-status[\s\S]*?Статус смены недоступен/, 'shift API failure has an explicit state');
assert.match(lock, /lock-button-glyph[^\n]*width:18px!important;height:18px!important/, 'lock glyph matches the other 18px icons');
assert.match(lock, /width="18" height="18" viewBox="0 0 24 24"/, 'inline lock icon dimensions match the shared icon scale');
assert.match(css, /\.velora-theme \.portal-header \.header-right > \.notification-bell,\.velora-theme \.portal-header \.header-right > \.lock-settings-button,\.velora-theme \.portal-header \.header-right > #lock-screen-button\{border:0;outline:none;box-shadow:none;background:transparent;color:#c4cad1\}/, 'header action icons share borderless neutral styling');
assert.match(css, /\.velora-theme \.portal-header \.header-right > \.notification-bell:focus-visible[\s\S]*?outline:2px solid #ff9a8f/, 'borderless actions retain a visible keyboard focus ring');
assert.match(lock, /stroke="currentColor"/, 'lock glyph inherits the shared icon color');
assert.doesNotMatch(lock, /stroke="#ff7a83"|color:#ff7a83!important/, 'lock glyph does not keep its old red accent');
assert.match(server, /canSeeShiftOpener[\s\S]*?LEFT JOIN users u ON u\.id=s\.opened_by AND \(u\.venue_id=s\.venue_id OR u\.organization_id=/, 'shift opener identity is joined within the same venue or organization');
assert.match(portal, /Смена открыта\$\{name\?` · \$\{name\}`:''\}/, 'open shift status includes opener when the API provides one');
assert.match(css, /Shared CRM top bar contract/, 'header rules are documented as the final shared contract');
assert.match(css, /\.velora-theme \.portal-header \.header-right>\.notification-bell[^}]*flex:0 0 44px;width:44px;height:44px/, 'portal actions keep equal desktop hit targets');
assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.header-shift-status\{display:inline-block;max-width:clamp\(72px,22vw,140px\);font-size:11px\}/, 'compact header keeps shift status visible within a bounded width');
assert.match(css, /\.portal\.velora-theme \.portal-shell\{height:100%;min-height:0;overflow:hidden\}/, 'legacy management shell uses the same bounded scroll frame');
assert.match(css, /\.portal\.velora-theme \.portal-header,\.staff-theme main>header\{position:sticky;top:0;z-index:20\}/, 'management and employee action bars remain visible during workspace scrolling');
assert.match(css, /@media\(min-width:651px\) and \(max-width:900px\)\{\.velora-theme \.portal-header\{padding-left:64px\}\}/, 'Fold portrait header reserves the floating menu button footprint');
assert.match(css, /staff-header-user>#lock-screen-button \.lock-button-glyph\{width:18px!important;height:18px!important\}/, 'staff header uses the same lock icon size');
assert.match(css, /@media\(max-width:650px\)\{\.staff-theme header\{[^}]*flex-wrap:wrap/, 'staff header reflows before controls can be clipped on phones');
assert.match(icons, /<symbol id="menu-2"/, 'mobile menu control has a real icon in the shared sprite');
assert.match(portal, /tabler-icons\.svg\?rev=5#\$\{name\}/, 'mobile menu references the current icon sprite');
assert.match(portal, /iconMarkup\('menu-2'\)/, 'mobile menu requests the implemented icon');

for (const [source, target] of [['style.css', 'style.css'], ['portal.js', 'portal.js'], ['lock.js', 'lock.js'], ['header-shell.js', 'header-shell.js'], ['index.html', 'index.html'], ['assets/tabler-icons.svg', 'assets/tabler-icons.svg']]) {
  assert.equal(fs.readFileSync(`dist/${target}`, 'utf8'), fs.readFileSync(source, 'utf8'), `dist/${target} must match source`);
}
for (const [source, target] of pages) {
  assert.equal(fs.readFileSync(`dist/${target}`, 'utf8'), fs.readFileSync(source, 'utf8'), `dist/${target} must match source`);
}

console.log(`HEADER SHELL CONTRACT: PASS (${pages.length} management routes, shared state, responsive sizing, and dist parity)`);

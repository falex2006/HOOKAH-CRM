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
const css = fs.readFileSync('style.css', 'utf8');
const lock = fs.readFileSync('lock.js', 'utf8');
const icons = fs.readFileSync('assets/tabler-icons.svg', 'utf8');

for (const [file] of pages) {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<header class="portal-header">/, `${file}: portal header exists`);
  assert.match(html, /src="\/header-shell\.js\?rev=\d+"><\/script><script src="\/lock\.js/, `${file}: shared header initializes before lock controls`);
  assert.match(html, /data-user-name/, `${file}: profile remains bound to session data`);
}

assert.match(shell, /header\.dataset\.shellReady = 'true'/, 'header normalization is idempotent');
assert.match(shell, /bell\.setAttribute\('aria-label', 'Уведомления'\)/, 'bell has one accessible meaning');
assert.match(shell, /shift\.dataset\.shiftState = 'loading'/, 'shift starts in a truthful loading state');
assert.match(shell, /actions\.replaceChildren\(\.\.\.ordered\)/, 'header actions use one predictable order');
assert.match(portal, /loadHeaderNotificationItems/, 'bell uses the shared notification model');
assert.match(portal, /markHeaderNotificationsSeen\(items\)/, 'bell marks the items it actually displays');
assert.match(portal, /results\.every\(\(result\) => result\.status === 'rejected'\)/, 'only a total notification API failure hides the inbox');
assert.match(portal, /uniqueItems = new Map\(\)/, 'notifications from overlapping endpoints are deduplicated');
assert.match(portal, /items\.partial = results\.some\(\(result\) => result\.status === 'rejected'\)/, 'partial notification availability is exposed to the user');
assert.match(portal, /header-shift-status[\s\S]*?Статус смены недоступен/, 'shift API failure has an explicit state');
assert.match(lock, /lock-button-glyph[^\n]*width:18px!important;height:18px!important/, 'lock glyph matches the other 18px icons');
assert.match(lock, /width="18" height="18" viewBox="0 0 24 24"/, 'inline lock icon dimensions match the shared icon scale');
assert.match(css, /Shared CRM top bar contract/, 'header rules are documented as the final shared contract');
assert.match(css, /\.velora-theme \.portal-header \.header-right>\.notification-bell[^}]*flex:0 0 44px;width:44px;height:44px/, 'portal actions keep equal desktop hit targets');
assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.header-shift-status\{display:none\}/, 'compact header hides secondary state consistently');
assert.match(css, /staff-header-user>#lock-screen-button \.lock-button-glyph\{width:18px!important;height:18px!important\}/, 'staff header uses the same lock icon size');
assert.match(css, /@media\(max-width:650px\)\{\.staff-theme header\{[^}]*flex-wrap:wrap/, 'staff header reflows before controls can be clipped on phones');
assert.match(icons, /<symbol id="menu-2"/, 'mobile menu control has a real icon in the shared sprite');
assert.match(portal, /tabler-icons\.svg\?rev=4#\$\{name\}/, 'mobile menu references the current icon sprite');
assert.match(portal, /iconMarkup\('menu-2'\)/, 'mobile menu requests the implemented icon');

for (const [source, target] of [['style.css', 'style.css'], ['portal.js', 'portal.js'], ['lock.js', 'lock.js'], ['header-shell.js', 'header-shell.js'], ['index.html', 'index.html'], ['assets/tabler-icons.svg', 'assets/tabler-icons.svg']]) {
  assert.equal(fs.readFileSync(`dist/${target}`, 'utf8'), fs.readFileSync(source, 'utf8'), `dist/${target} must match source`);
}
for (const [source, target] of pages) {
  assert.equal(fs.readFileSync(`dist/${target}`, 'utf8'), fs.readFileSync(source, 'utf8'), `dist/${target} must match source`);
}

console.log(`HEADER SHELL CONTRACT: PASS (${pages.length} management routes, shared state, responsive sizing, and dist parity)`);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
assert.equal(fs.readFileSync(new URL('../dist/portal.js', import.meta.url), 'utf8'), portal, 'source/dist portal parity');
const slice = (startMarker, endMarker) => {
  const start = portal.indexOf(startMarker);
  const end = portal.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `actual source markers: ${startMarker}`);
  return portal.slice(start, end);
};
const helpers = slice('  const disclosureKeys =', '  const ensureAreaGroup =');
const normalize = slice("  sidebar.querySelectorAll('details.sidebar-nav-group[data-nav-group]').forEach((group) => {\n    group.open = !group.hidden", '  const settingsHashes =');
const filter = slice('const refreshSidebarGroups = () => {', 'refreshSidebarGroups();');
const keys = ['operations', 'menu', 'inventory', 'finance', 'team', 'system'];
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
function setup({ href = 'http://127.0.0.1/admin', storage = new Map(), blocked = false, id = 'user-a', venueId = 'venue-a' } = {}) {
  const frames = [], scroll = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 300 }) };
  const groups = keys.map((key) => {
    const summary = { handlers: {}, attrs: {}, rect: { top: 20, bottom: 64 },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); },
      getClientRects() { return [{}]; }, getBoundingClientRect() { return this.rect; } };
    return { dataset: { navGroup: key }, open: false, hidden: false, summary, links: [{ hidden: false }], handlers: {},
      addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); },
      querySelector(selector) { return selector === ':scope > summary' ? summary : null; },
      querySelectorAll(selector) { assert.equal(selector, '.portal-nav a'); return this.links; },
      closest(selector) { assert.equal(selector, '.sidebar-nav-groups'); return scroll; } };
  });
  const sidebar = { querySelectorAll(selector) { assert.equal(selector, 'details.sidebar-nav-group[data-nav-group]'); return groups; } };
  const location = { href };
  const context = vm.createContext({ URL, JSON, encodeURIComponent, location, sidebar, portalUser: { id, venueId },
    requestAnimationFrame: callback => frames.push(callback),
    localStorage: {
      getItem(key) { if (blocked) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('blocked'); storage.set(key, value); },
    }, document: { querySelectorAll(selector) {
      if (selector === '.portal-sidebar details.sidebar-nav-group') return groups;
      assert.equal(selector, '.portal-sidebar > .portal-nav,.portal-sidebar > .sidebar-nav-groups > .portal-nav'); return [];
    } } });
  const installHelpers = () => vm.runInContext('(() => {\n' + helpers + '\n' + filter + '\n' +
    'globalThis.qa = { storageKey: disclosureStorageKey, route: disclosureRoute, saved: savedGroupState, remember: rememberGroupState, refresh: refreshSidebarGroups, normalize: () => {\n' + normalize + '\n} };\n})();', context);
  installHelpers();
  groups.forEach(group => context.qa.remember(group, group.dataset.navGroup));
  const opened = () => groups.filter(group => group.open).map(group => group.dataset.navGroup);
  const click = (key) => {
    let prevented = false;
    groups.find(group => group.dataset.navGroup === key).summary.handlers.click.forEach(callback => callback({ preventDefault() { prevented = true; } }));
    check(prevented, true, 'summary native toggle is replaced atomically');
  };
  const navigate = (href) => {
    location.href = href;
    // normalizeManagementSidebar recreates route-local helpers on each actual
    // popstate/view change, while the sidebar DOM and memory selection survive.
    installHelpers();
    context.qa.normalize();
  };
  return { get qa() { return context.qa; }, groups, sidebar, location, frames, scroll, storage, opened, click, navigate };
}

const legacy = new Map(keys.map(key => [`crm_sidebar_group_user-a_${key}`, 'open']));
const repeated = setup();
for (let pass = 0; pass < 6; pass++) repeated.groups.forEach(group => repeated.qa.remember(group, group.dataset.navGroup));
check(repeated.groups.map(group => group.summary.handlers.click.length), keys.map(() => 1), 'repeated binding retains exactly one summary click callback per group');
check(repeated.groups.map(group => group.handlers.toggle.length), keys.map(() => 1), 'repeated binding retains exactly one toggle callback per group');
repeated.click('menu'); check(repeated.opened(), ['menu'], 'repeated binding cannot toggle an opened group closed within the same click');
repeated.click('menu'); check(repeated.opened(), [], 'a subsequent explicit click closes the group once');
repeated.navigate('http://127.0.0.1/inventory?view=stock');
repeated.groups.forEach(group => repeated.qa.remember(group, group.dataset.navGroup));
check(repeated.groups.map(group => group.summary.handlers.click.length), keys.map(() => 1), 'new route helper closures cannot append another handler to existing summaries');
repeated.click('finance'); check(repeated.opened(), ['finance'], 'one click still opens another group after repeated route normalization');
const desk = setup({ storage: legacy });
desk.qa.normalize(); check(desk.opened(), [], 'legacy all-open flags cannot reopen all groups on overview');
desk.click('operations'); check(desk.opened(), ['operations'], 'first group opens');
desk.click('inventory'); check(desk.opened(), ['inventory'], 'second group atomically closes first');
check(desk.groups.map(group => group.summary.attrs['aria-expanded']), keys.map(key => String(key === 'inventory')), 'all summaries retain truthful expanded state');
const selection = JSON.parse(desk.storage.get(desk.qa.storageKey()));
check(selection, { route: '/admin', openGroup: 'inventory' }, 'one selection replaces independent open flags');
const reload = setup({ storage: desk.storage }); reload.qa.normalize(); check(reload.opened(), ['inventory'], 'same-route reload preserves explicit selection');
reload.click('inventory'); check(reload.opened(), [], 'clicking the open group collapses it');
reload.qa.normalize(); check(reload.opened(), [], 'same-page normalization preserves explicit all-closed state');
const closedReload = setup({ storage: reload.storage }); closedReload.qa.normalize(); check(closedReload.opened(), [], 'reload preserves all-closed state');
const order = setup({ href: 'http://127.0.0.1/orders', storage: reload.storage }); order.qa.normalize(); check(order.opened(), ['operations'], 'new route opens its own section instead of stale explicit choice');
const product = setup({ href: 'http://127.0.0.1/inventory?view=products&venue=irrelevant', storage: reload.storage }); product.qa.normalize(); check(product.opened(), ['menu'], 'product route selects menu');
const stock = setup({ href: 'http://127.0.0.1/inventory', storage: product.storage }); stock.qa.normalize(); check(stock.opened(), ['inventory'], 'default stock route selects inventory');
check(stock.qa.route(), '/inventory?view=stock', 'default stock route is canonical');
check(JSON.parse(stock.storage.get(stock.qa.storageKey())), { route: '/inventory?view=stock', openGroup: 'inventory' }, 'normalization persists the current route and visible default group');
const traversal = setup({ href: 'http://127.0.0.1/inventory?view=stock' });
traversal.qa.normalize(); traversal.click('menu');
check(traversal.opened(), ['menu'], 'stock permits manually browsing menu before navigation');
traversal.navigate('http://127.0.0.1/inventory?view=products');
check(traversal.opened(), ['menu'], 'products opens its route group after leaving stock');
check(JSON.parse(traversal.storage.get(traversal.qa.storageKey())), { route: '/inventory?view=products', openGroup: 'menu' }, 'products normalization replaces the earlier stock browsing selection');
traversal.navigate('http://127.0.0.1/inventory?view=stock');
check(traversal.opened(), ['inventory'], 'Back to stock restores inventory rather than the old manually browsed menu');
check([traversal.sidebar._disclosureSelection.route, traversal.sidebar._disclosureSelection.openGroup], ['/inventory?view=stock', 'inventory'], 'Back records the resolved stock state in memory');
traversal.navigate('http://127.0.0.1/inventory?view=products');
check(traversal.opened(), ['menu'], 'Forward restores the products route group');
traversal.click('finance'); traversal.qa.normalize();
check(traversal.opened(), ['finance'], 'same-route normalization preserves a manual selection after history traversal');
const traversedReload = setup({ href: traversal.location.href, storage: traversal.storage }); traversedReload.qa.normalize();
check(traversedReload.opened(), ['finance'], 'reload preserves a manual selection on the current history route');
const staleStoredRoute = setup({ href: 'http://127.0.0.1/inventory?view=stock' });
staleStoredRoute.storage.set(staleStoredRoute.qa.storageKey(), JSON.stringify({ route: '/inventory?view=stock', openGroup: 'menu' }));
staleStoredRoute.sidebar._disclosureSelection = { storageKey: staleStoredRoute.qa.storageKey(), route: '/inventory?view=products', openGroup: 'menu' };
check(staleStoredRoute.qa.saved('menu'), null, 'cross-route memory prevents fallback to an obsolete stored choice for the destination');
staleStoredRoute.qa.normalize(); check(staleStoredRoute.opened(), ['inventory'], 'route normalization resolves a conflict between old memory and old storage');
const blockedTraversal = setup({ href: 'http://127.0.0.1/inventory?view=stock', blocked: true });
blockedTraversal.qa.normalize(); blockedTraversal.click('menu'); blockedTraversal.navigate('http://127.0.0.1/inventory?view=products'); blockedTraversal.navigate('http://127.0.0.1/inventory?view=stock');
check(blockedTraversal.opened(), ['inventory'], 'Back uses route defaults when storage is unavailable');
check([blockedTraversal.sidebar._disclosureSelection.route, blockedTraversal.sidebar._disclosureSelection.openGroup], ['/inventory?view=stock', 'inventory'], 'normalized memory still advances when writing storage fails');
const settings = setup({ href: 'http://127.0.0.1/admin#settings' }); settings.click('team');
const settingsAlias = setup({ href: 'http://127.0.0.1/admin#lock-security', storage: settings.storage }); settingsAlias.qa.normalize(); check(settingsAlias.opened(), ['team'], 'settings subroutes retain an explicit same-section choice');
settings.location.href = 'http://127.0.0.1/inventory?view=recipes'; settings.click('finance');
check(JSON.parse(settings.storage.get(settings.qa.storageKey())).route, '/inventory?view=recipes', 'existing handler saves the live route rather than an obsolete closure');
for (const [id, venueId] of [['user-b', 'venue-a'], ['user-a', 'venue-b']]) {
  const isolated = setup({ id, venueId, storage: desk.storage }); isolated.qa.normalize();
  check(isolated.opened(), [], `preference isolation: ${id}/${venueId}`);
}
for (const bad of ['broken-json', JSON.stringify({ route: '/admin', openGroup: 'unknown' }), JSON.stringify({ route: '/orders', openGroup: 'finance' })]) {
  const invalid = setup(); invalid.storage.set(invalid.qa.storageKey(), bad); invalid.qa.normalize();
  check(invalid.opened(), [], 'malformed, unknown or foreign-route selection is ignored');
}
const blocked = setup({ blocked: true }); blocked.click('finance'); blocked.qa.normalize();
check(blocked.opened(), ['finance'], 'storage failure preserves selection in memory for the current page');
const denied = setup(); denied.groups[2].hidden = true; denied.click('inventory'); check(denied.opened(), [], 'a hidden group cannot be opened by its summary handler');
denied.click('finance'); denied.groups[3].links[0].hidden = true; denied.qa.refresh();
check([denied.groups[3].hidden, denied.groups[3].open, denied.groups[3].summary.attrs['aria-expanded']], [true, false, 'false'], 'permission filtering hides and closes denied groups');
denied.groups[2].hidden = true; denied.sidebar._disclosureSelection = { storageKey: denied.qa.storageKey(), route: '/admin', openGroup: 'inventory' }; denied.qa.normalize();
check(denied.opened(), [], 'saved selection cannot reopen a permission-hidden group');
const manualScroll = setup(); manualScroll.groups[4].summary.rect = { top: 350, bottom: 394 }; manualScroll.click('team'); manualScroll.frames.forEach(frame => frame());
check(manualScroll.scroll.scrollTop, 102, 'manual activation reveals only the clicked heading inside the menu');
manualScroll.groups[4].open = false; const beforeToggleFrames = manualScroll.frames.length; manualScroll.groups[4].handlers.toggle.forEach(callback => callback());
check(manualScroll.groups[4].summary.attrs['aria-expanded'], 'false', 'native toggle keeps aria-expanded truthful');
check(manualScroll.frames.length, beforeToggleFrames, 'toggle event cannot pull scroll back to an unrelated active group');

console.log(`SIDEBAR DISCLOSURE ACTUAL SOURCE: PASS (${checks} cases; VM only, no browser/server writes)`);

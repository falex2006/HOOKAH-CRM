import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const start = source.indexOf('function setupPortalDashboardNavigation()');
const end = source.indexOf('function renderDashboard()', start);
assert.ok(start >= 0 && end > start);
const helper = source.slice(start, end);
const dashboardEnd = source.indexOf('function renderInventory()', end);
assert.doesNotMatch(source.slice(end, dashboardEnd), /scrollIntoView|_dashboardHashChangeHandler/, 'render/update cannot initiate competing native/smooth scroll');
assert.match(source, /if \(page === 'dashboard'\) setupPortalDashboardNavigation\(\);/, 'install after all initial dashboard/tasks/loyalty dispatches');
let scenarios = 0;
function harness({ hash = '#staff', page = 'dashboard', destinationTop = 260 } = {}) {
  const frames = [], scrolls = [], renders = [], events = {}, docEvents = {}, history = [];
  const location = { href: `http://localhost/admin${hash}`, hash };
  const header = { getBoundingClientRect: () => ({ height: 68 }) };
  const section = { getClientRects: () => [1], getBoundingClientRect: () => ({ top: destinationTop }) };
  const main = { scrollTop: 400, querySelector: () => header, getBoundingClientRect: () => ({ top: 0 }), scrollTo: (args) => { scrolls.push(args); main.scrollTop = args.top; } };
  const selectors = [];
  const target = { closest: (selector) => { assert.equal(selector, '.portal-main'); return main; }, querySelector: (selector) => { selectors.push(selector); return section; } };
  const window = { location, history: { pushState: (_, title, url) => { assert.equal(title, ''); history.push(url); location.href = url; location.hash = new URL(url).hash; } }, addEventListener: (type, handler) => { (events[type] ||= []).push(handler); } };
  const context = { page, window, URL, Object, adminSectionTitles: { '#staff': 'staff', '#tasks': 'tasks', '#loyalty': 'loyalty', '#settings': 'settings', '#company': 'company', '#audit': 'audit', '#venue-layout-settings': 'layout', '#lock-security': 'lock', '#shift-control': 'shift', '#settings-dashboard-modules': 'modules', '#diagnostics': 'diagnostics' }, requestAnimationFrame: (fn) => frames.push(fn),
    document: { querySelector: () => target, addEventListener: (type, handler) => { (docEvents[type] ||= []).push(handler); } },
    normalizeManagementSidebar: () => renders.push('sidebar'), updateAdminSectionTitle: () => renders.push('title'), renderDashboard: () => renders.push('dashboard'), renderTasks: () => renders.push('tasks'), renderLoyalty: () => renders.push('loyalty'),
  };
  vm.runInNewContext(`${helper}\nsetupPortalDashboardNavigation();`, context, { timeout: 1000 });
  const flush = () => { while (frames.length) frames.shift()(); };
  const click = (href, overrides = {}) => {
    let prevented = false;
    const link = { target: '', hasAttribute: () => false, getAttribute: () => href };
    const event = { button: 0, target: { closest: () => link }, preventDefault: () => { prevented = true; }, ...overrides };
    docEvents.click?.[0](event); return prevented;
  };
  return { context, target, main, window, location, frames, scrolls, renders, events, docEvents, history, flush, click, selectors };
}
for (const hash of ['', '#staff', '#tasks', '#loyalty', '#settings', '#diagnostics']) {
  const test = harness({ hash }); assert.equal(test.scrolls.length, 0); test.flush();
  assert.equal(test.scrolls.length, 1); assert.equal(test.scrolls[0].top, 0); assert.equal(test.scrolls[0].behavior, 'auto'); scenarios++;
}
for (const hash of ['#company', '#audit', '#venue-layout-settings', '#settings-dashboard-modules', '#lock-security', '#shift-control']) {
  const test = harness({ hash }); test.flush(); assert.equal(test.scrolls[0].top, 580, `${hash}: section aligns 12px below sticky 68px header`); scenarios++;
}
const clipped = harness({ hash: '#company', destinationTop: -500 }); clipped.flush(); assert.equal(clipped.scrolls[0].top, 0, 'negative scroll clamps'); scenarios++;
const layout = harness({ hash: '#venue-layout-settings' }); layout.flush();
assert.deepEqual(layout.selectors, ['#floor-editor'], 'layout starts at the first visible map heading, not the lower controls after an asynchronously growing map');
const layoutScrolls = layout.scrolls.length;
layout.main.scrollTop = 350;
vm.runInNewContext('setupPortalDashboardNavigation();', layout.context); layout.flush();
assert.equal(layout.scrolls.length, layoutScrolls, 'async map expansion/background setup does not reset scroll'); scenarios++;
const normal = harness(); normal.flush();
vm.runInNewContext('setupPortalDashboardNavigation();', normal.context); normal.flush();
assert.equal(normal.events.hashchange.length, 1); assert.equal(normal.docEvents.click.length, 1); assert.equal(normal.scrolls.length, 1, 'background setup does not reset scroll'); scenarios++;
assert.equal(normal.click('/admin#tasks'), true); assert.match(normal.history[0], /#tasks$/); assert.ok(normal.renders.includes('tasks')); assert.equal(normal.scrolls.length, 1); normal.flush(); assert.equal(normal.scrolls.at(-1).top, 0); scenarios++;
const count = normal.renders.length; assert.equal(normal.click('#tasks'), true); normal.flush(); assert.equal(normal.renders.length, count, 'same route restores scroll without rerender'); scenarios++;
assert.equal(normal.click('#company'), true); assert.equal(normal.click('#audit'), true); const before = normal.scrolls.length; normal.flush(); assert.equal(normal.scrolls.length, before + 1, 'only latest route scroll runs'); scenarios++;
for (const [href, modifiers] of [['/admin#tasks', { ctrlKey: true }], ['/admin#tasks', { button: 1 }], ['/admin#tasks', { defaultPrevented: true }], ['/finance', {}], ['http://other.test/admin#tasks', {}], ['/admin?venue=b#tasks', {}], ['#unknown', {}]]) {
  assert.equal(normal.click(href, modifiers), false, 'leave browser cross-page, alternate tab and unknown anchor handling intact'); scenarios++;
}
normal.location.hash = '#loyalty'; normal.events.hashchange[0](); normal.flush(); assert.ok(normal.renders.includes('loyalty')); assert.equal(normal.scrolls.at(-1).top, 0); scenarios++;
const wrongPage = harness({ page: 'finance' }); wrongPage.flush(); assert.equal(wrongPage.scrolls.length, 0); assert.equal(wrongPage.events.hashchange, undefined); scenarios++;
console.log(`PASS local dashboard navigation: ${scenarios} scenarios (actual helper, no browser/DB writes)`);

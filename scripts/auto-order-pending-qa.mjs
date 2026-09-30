import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const loadStart = portal.indexOf('  const loadAutoOrders = async () => {');
const loadEnd = portal.indexOf("  document.querySelector('#auto-order-list')?.addEventListener", loadStart);
assert.ok(loadStart > 0 && loadEnd > loadStart);
const pendingLoads = [];
const notices = [];
const loadContext = {
  autoOrderLoadGeneration: 0,
  autoOrderState: { items: [], requests: [], error: null, hasLoaded: false },
  api: (url) => new Promise((resolve, reject) => { assert.equal(url, '/api/inventory/auto-orders'); pendingLoads.push({ resolve, reject }); }),
  drawAutoOrders: () => {}, refreshInventoryContext: () => {},
  portalNotice: (message, kind) => notices.push({ message, kind }),
};
vm.runInNewContext(`${portal.slice(loadStart, loadEnd)}\nglobalThis.qaLoadAutoOrders = loadAutoOrders;`, loadContext);
const oldLoad = loadContext.qaLoadAutoOrders();
const latestLoad = loadContext.qaLoadAutoOrders();
pendingLoads[1].resolve({ items: [{ id: 'new' }], requests: [] });
assert.equal(await latestLoad, true);
pendingLoads[0].reject(new Error('stale failure'));
assert.equal(await oldLoad, null);
assert.equal(loadContext.autoOrderState.items[0].id, 'new');
assert.equal(loadContext.autoOrderState.error, null);
assert.equal(notices.length, 0, 'older failure must not replace newer success');

const createStart = portal.indexOf("  document.querySelector('#create-auto-order')?.addEventListener('click', async () => {");
const createEnd = portal.indexOf('  loadAutoOrders();', createStart);
assert.ok(createStart > 0 && createEnd > createStart);
const requests = [];
let onCreate;
let refreshResolve;
const selected = { checked: true, dataset: { autoOrderItem: 'stock-1' } };
const quantity = { value: '2' };
const context = {
  autoOrderCreatePending: false,
  autoOrderState: { items: [{ id: 'stock-1' }], requests: [], error: null },
  document: { querySelector: (selector) => selector === '#create-auto-order' ? { addEventListener: (_name, callback) => { onCreate = callback; } } : quantity, querySelectorAll: () => [selected] },
  CSS: { escape: (value) => value },
  drawAutoOrders: () => {},
  api: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  loadAutoOrders: () => new Promise((resolve) => { refreshResolve = resolve; }),
  portalNotice: (message, kind) => notices.push({ message, kind }),
};
vm.runInNewContext(portal.slice(createStart, createEnd), context);
quantity.value = '0';
await onCreate();
assert.equal(requests.length, 0);
assert.ok(notices.some((notice) => notice.message.includes('больше нуля')));
quantity.value = '2';
const first = onCreate();
assert.equal(context.autoOrderCreatePending, true);
assert.equal(requests.length, 1);
await onCreate();
assert.equal(requests.length, 1, 'rerendered button cannot duplicate pending POST');
requests[0].resolve({ id: 'order-1', status: 'sent', lines: [] });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(context.autoOrderCreatePending, true, 'pending must cover refresh');
assert.equal(selected.checked, false, 'successful create must clear selection before another order');
refreshResolve(false);
await first;
assert.equal(context.autoOrderCreatePending, false);
assert.equal(context.autoOrderState.requests[0].id, 'order-1', 'created request remains visible after refresh failure');
assert.ok(notices.some((notice) => notice.message.includes('Заявка создана, но список не обновился')));

const autoOrderScope = portal.slice(portal.indexOf('  const drawAutoOrders = () => {'), loadStart);
assert.match(autoOrderScope, /autoOrderCancelPending\.has\(request\.id\)/, 'cancel must be guarded by request id');
assert.match(autoOrderScope, /const priorSelections = new Map/, 'redraw must retain quantity edits');
const cancelStart = portal.indexOf("    history?.querySelectorAll('[data-auto-order-cancel]').forEach", portal.indexOf('  const drawAutoOrders = () => {'));
const cancelEnd = portal.indexOf('\n  };', cancelStart);
let cancelHandler;
const pendingCancel = new Set();
const cancelRequests = [];
const cancelNotices = [];
const cancelContext = {
  history: { querySelectorAll: () => [{ dataset: { autoOrderCancel: 'order-1' }, addEventListener: (_name, handler) => { cancelHandler = handler; } }] },
  requests: [{ id: 'order-1', status: 'sent' }],
  autoOrderCancelPending: pendingCancel,
  window: { confirm: () => true }, drawAutoOrders: () => {},
  api: (url, options) => new Promise((resolve, reject) => cancelRequests.push({ url, options, resolve, reject })),
  loadAutoOrders: async () => null,
  portalNotice: (message, kind) => cancelNotices.push({ message, kind }),
};
vm.runInNewContext(portal.slice(cancelStart, cancelEnd), cancelContext);
const cancelFirst = cancelHandler();
await cancelHandler();
assert.equal(cancelRequests.length, 1, 'same order cancellation cannot duplicate');
assert.equal(pendingCancel.has('order-1'), true);
cancelRequests[0].resolve({ status: 'cancelled' });
await cancelFirst;
assert.equal(pendingCancel.has('order-1'), false);
assert.ok(cancelNotices.some((notice) => notice.message === 'Заявка отменена'));
assert.equal(cancelNotices.some((notice) => notice.message.includes('список не обновился')), false, 'superseded read is not a failure');

const receiptStart = portal.indexOf('  const openAutoOrderReceipt = (request) => {');
const receiptEnd = portal.indexOf('  const drawAutoOrders = () => {', receiptStart);
let confirmCount = 0;
const receiptContext = {
  purchaseForm: { dataset: { editId: 'draft-1' } }, purchaseActionPending: false,
  window: { confirm: () => { confirmCount += 1; return false; } },
};
vm.runInNewContext(`${portal.slice(receiptStart, receiptEnd)}\nglobalThis.qaOpenReceipt = openAutoOrderReceipt;`, receiptContext);
receiptContext.qaOpenReceipt({ id: 'order-1' });
assert.equal(confirmCount, 1, 'replacing a dirty purchase draft requires confirmation');
assert.match(portal, /demo-auto-order-\$\{Date\.now\(\)\}-\$\{\(demoState\.inventoryAutoOrders \|\| \[\]\)\.length \+ 1\}/);
console.log('PASS auto-order latest-load, create pending, invalid quantity, and refresh QA');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const capture = portal.slice(portal.indexOf("document.addEventListener('submit'"), portal.indexOf('\n', portal.indexOf("document.addEventListener('submit'")));
assert.match(capture, /'purchase-document-form'/, 'purchase form must own pending state');
const start = portal.indexOf("  purchaseForm?.addEventListener('submit', async (event) => {");
const end = portal.indexOf("  if (purchaseForm) document.querySelector('#purchase-date').value = '';", start);
assert.ok(start > 0 && end > start, 'purchase handlers found');
const block = portal.slice(start, end);

const handlers = { list: [] };
const message = { textContent: '', className: '' };
const fields = new Map([
  ['#purchase-message', message], ['#purchase-supplier', { value: 'QA поставщик', focus: () => {} }],
  ['#purchase-number', { value: 'QA-1' }], ['#purchase-date', { value: '' }],
  ['#purchase-note', { value: '' }], ['#purchase-save', { textContent: 'Сохранить черновик' }],
  ['#purchase-cancel', { hidden: true, addEventListener: (_name, handler) => { handlers.cancel = handler; } }],
  ['#purchase-order-context', { hidden: true }],
  ['#purchase-document-list', { addEventListener: (_name, handler) => { handlers.list.push(handler); } }],
]);
const form = { dataset: {}, addEventListener: (_name, handler) => { handlers.submit = handler; }, scrollIntoView: () => {} };
const requests = [];
const notices = [];
let resetCount = 0;
let loadResult = true;
const context = {
  purchaseForm: form, purchaseActionPending: false,
  setPurchasePending: (pending) => { context.purchaseActionPending = pending; },
  getPurchaseLines: () => [{ ingredientId: 'stock-1', quantity: 1, unit: 'шт', unitCost: 10 }],
  document: { querySelector: (selector) => fields.get(selector) },
  resetPurchaseForm: () => { resetCount += 1; },
  loadPurchaseDocuments: async () => loadResult,
  loadAutoOrders: async () => true,
  load: async () => true,
  purchaseDocuments: [{ id: 'draft-1', status: 'draft', supplierName: 'QA поставщик', totalCost: 10, lines: [{ ingredientId: 'stock-1', quantity: 1, unit: 'шт', unitCost: 10 }] }],
  api: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  portalNotice: (text, kind) => notices.push({ text, kind }),
  window: { confirm: () => true }, money: (value) => String(value),
  renderPurchaseLines: () => {}, updatePurchasePreviews: () => {},
};
vm.runInNewContext(block, context);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const submit = () => handlers.submit({ preventDefault() {} });
const click = (attribute) => ({ target: { closest: (selector) => selector === `[${attribute}]` ? { dataset: { purchasePost: 'draft-1', purchaseVoid: 'draft-1' } } : null } });
const post = () => handlers.list[1](click('data-purchase-post'));
const voidDraft = () => handlers.list[2](click('data-purchase-void'));

fields.get('#purchase-supplier').value = '';
submit();
assert.equal(requests.length, 0);
assert.match(message.textContent, /Укажите поставщика/);
fields.get('#purchase-supplier').value = 'QA поставщик';
submit();
assert.equal(context.purchaseActionPending, true);
assert.equal(requests.length, 1);
assert.equal(requests[0].options.method, 'POST');
submit(); handlers.cancel(); await post(); await voidDraft();
assert.equal(requests.length, 1, 'save blocks duplicate, post, and void');
assert.equal(resetCount, 0, 'cancel cannot replace pending editor');
requests[0].reject({ payload: { error: 'invalid_purchase_unit' } });
await tick();
assert.equal(context.purchaseActionPending, false);
assert.match(message.textContent, /единицу закупки/);
submit();
assert.equal(requests.length, 2, 'failed save retries immediately');
let resolveLoad;
loadResult = new Promise((resolve) => { resolveLoad = resolve; });
requests[1].resolve({ id: 'draft-1' });
await tick();
assert.equal(resetCount, 0, 'new line controls must not appear during slow refresh');
assert.equal(context.purchaseActionPending, true);
resolveLoad(false);
await tick();
assert.equal(resetCount, 1);
assert.match(message.textContent, /Черновик сохранён/);
assert.ok(notices.some((item) => item.text.includes('список не обновился')));

const postPromise = post();
assert.equal(requests.length, 3);
assert.equal(requests[2].url, '/api/inventory/purchase-documents/draft-1/post');
await voidDraft();
assert.equal(requests.length, 3, 'void cannot race post');
requests[2].reject({ payload: { error: 'purchase_document_post_failed', detail: 'purchase_item_unit_changed' } });
await postPromise;
assert.ok(notices.some((item) => item.text.includes('Карточка позиции изменилась')));
assert.equal(context.purchaseActionPending, false);

const voidPromise = voidDraft();
assert.equal(requests.length, 4);
assert.equal(requests[3].url, '/api/inventory/purchase-documents/draft-1/void');
requests[3].resolve({ status: 'voided' });
await voidPromise;
assert.ok(notices.some((item) => item.text.includes('Черновик отменён')));
assert.equal(context.purchaseActionPending, false);

console.log('PASS purchase draft save, retry, post/void serialization, and refresh warning QA');

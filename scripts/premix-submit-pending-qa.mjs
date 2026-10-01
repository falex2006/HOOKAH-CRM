import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const start = portal.indexOf("document.querySelector('#premix-form')?.addEventListener('submit',");
const end = portal.indexOf('\n', start);
assert.ok(start >= 0 && end > start, 'premix submit handler is available');
const handlerSource = portal.slice(start, end);

let handler;
let requests = 0;
let reloads = 0;
let inventoryLoads = 0;
const pending = [];
const submit = { disabled: false, textContent: 'Приготовить премикс' };
const form = {
  dataset: { canProduce: 'true' },
  querySelector: (selector) => selector === 'button[type=submit]' ? submit : null,
  addEventListener: (type, listener) => { assert.equal(type, 'submit'); handler = listener; },
};
const message = { textContent: '', className: 'form-message' };
const nodes = {
  '#premix-form': form,
  '#premix-recipe': { value: 'recipe-1' },
  '#premix-output': { value: 'stock-1' },
  '#premix-multiplier': { value: '2' },
  '#premix-actual-output': { value: '1.75' },
  '#premix-expires-at': { value: '2026-10-02T10:00' },
  '#premix-message': message,
};
const document = { querySelector: (selector) => nodes[selector] || null };
const api = (path, options) => {
  assert.equal(path, '/api/inventory/premixes/produce');
  assert.deepEqual(JSON.parse(options.body), { recipeId: 'recipe-1', outputItemId: 'stock-1', multiplier: 2, actualOutput: 1.75, expiresAt: new Date('2026-10-02T10:00').toISOString() });
  requests += 1;
  return new Promise((resolve, reject) => pending.push({ resolve, reject }));
};
const loadPremixData = () => { reloads += 1; return Promise.resolve(); };
const load = () => { inventoryLoads += 1; };
new Function('document', 'api', 'loadPremixData', 'load', handlerSource)(document, api, loadPremixData, load);
assert.equal(typeof handler, 'function');
const submitEvent = () => handler({ preventDefault() {}, currentTarget: form });
const settle = async () => { await new Promise((resolve) => setImmediate(resolve)); };

submitEvent();
submitEvent();
assert.equal(requests, 1, 'repeated submit while the request is pending produces one batch');
assert.equal(form.dataset.submitting, '1');
assert.equal(submit.disabled, true);
assert.equal(submit.textContent, 'Приготовление…');
pending[0].resolve({ outputQuantity: 2, outputUnit: 'л' });
await settle();
assert.equal(reloads, 1);
assert.equal(inventoryLoads, 1);
assert.equal(form.dataset.submitting, '0');
assert.equal(submit.disabled, false);
assert.equal(submit.textContent, 'Приготовить премикс');
assert.match(message.textContent, /Партия приготовлена/);

submitEvent();
pending[1].reject(Object.assign(new Error('stock'), { payload: { error: 'insufficient_premix_stock' } }));
await settle();
assert.equal(requests, 2, 'a failed batch can be retried once pending clears');
assert.equal(form.dataset.submitting, '0');
assert.equal(submit.disabled, false);
assert.match(message.textContent, /Недостаточно ингредиентов/);

form.dataset.canProduce = 'false';
submit.disabled = true;
submitEvent();
assert.equal(requests, 2, 'unavailable prerequisites reject even a synthetic submit event');
assert.equal(submit.disabled, true, 'missing prerequisites remain disabled after failure');

console.log('PREMIX SUBMIT PENDING QA: PASS (single request, refresh, failure/retry, unavailable prerequisites)');

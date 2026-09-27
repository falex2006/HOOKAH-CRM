import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const start = portal.indexOf('  const loadPremixData = () => {');
const end = portal.indexOf('; loadPremixData();', start);
assert.ok(start >= 0 && end > start, 'premix loader must be discoverable');
const loaderSource = portal.slice(start, end + 1);

const createFixture = () => {
  const controls = [{ disabled: false }, { disabled: false }, { disabled: false }];
  const classes = new Set(); const attributes = new Map();
  const nodes = {
    '#premix-recipe': { innerHTML: '' },
    '#premix-output': { innerHTML: '' },
    '#premix-form': { querySelectorAll: () => controls },
    '#premix-empty-guidance': { hidden: true, innerHTML: '', classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) }, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) },
    '#premix-batches': { innerHTML: '' },
  };
  const document = { querySelector: (selector) => nodes[selector] || null };
  const deps = { document, nodes, classes, attributes, controls };
  return deps;
};
const loadPremixData = (api, fixture) => new Function('api', 'document', 'esc', 'displayName', 'money', 'canWriteInventory', 'refreshInventoryContext', `${loaderSource}\nreturn loadPremixData;`)(
  api, fixture.document, String, String, (amount) => `${Number(amount || 0)} ₽`, true, () => {});

const failedFixture = createFixture();
const fail = loadPremixData((path) => path === '/api/inventory' ? Promise.reject(new Error('offline')) : Promise.resolve({ items: [] }), failedFixture);
await fail();
assert.equal(failedFixture.nodes['#premix-empty-guidance'].hidden, false);
assert.equal(failedFixture.attributes.get('role'), 'alert');
assert.ok(failedFixture.classes.has('auto-order-load-error'));
assert.match(failedFixture.nodes['#premix-empty-guidance'].innerHTML, /Не удалось загрузить данные премиксов/);
assert.match(failedFixture.nodes['#premix-empty-guidance'].innerHTML, /data-premix-retry/);
assert.ok(failedFixture.controls.every((control) => control.disabled), 'production stays disabled while prerequisites are unknown');
assert.match(failedFixture.nodes['#premix-batches'].innerHTML, /История партий временно недоступна/);

const recoveredFixture = createFixture();
const recover = loadPremixData((path) => Promise.resolve(path === '/api/recipes' ? { items: [{ id: 'r', name: 'Сироп', recipeType: 'premix', yieldQuantity: 1, yieldUnit: 'л' }] } : path === '/api/inventory' ? { items: [{ id: 'o', name: 'Сироп', unit: 'л' }] } : { items: [] }), recoveredFixture);
await recover();
assert.equal(recoveredFixture.nodes['#premix-empty-guidance'].hidden, true);
assert.ok(!recoveredFixture.classes.has('auto-order-load-error'));
assert.ok(recoveredFixture.controls.every((control) => !control.disabled), 'successful retry restores the production form');
assert.match(recoveredFixture.nodes['#premix-recipe'].innerHTML, /Сироп/);
assert.match(recoveredFixture.nodes['#premix-batches'].innerHTML, /Партии ещё не приготовлены/);

console.log('INVENTORY PREMIX LOAD STATE QA: PASS (visible failure/retry state and successful recovery)');

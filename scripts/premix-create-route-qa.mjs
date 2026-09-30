import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const pickerMarkup = portal.match(/picker\.innerHTML = '([^']+)'/)?.[1] || '';
assert.match(pickerMarkup, /id="recipe-ingredient-select"(?! required)/, 'ingredient picker is optional after adding a row');
assert.match(pickerMarkup, /id="recipe-ingredient-quantity"(?! required)/, 'picker quantity is optional after adding a row');
assert.match(portal, /id="recipe-ingredients"[^>]*required/, 'saved composition remains required');
assert.match(portal, /batch\.recipeName \|\| premixRecipes\.find\(\(recipe\) => String\(recipe\.id\) === String\(batch\.recipeId\)\)\?\.name/, 'batch history resolves recipe names when API only returns an ID');
const marker = "document.querySelector('#premix-empty-guidance')?.addEventListener('click',";
const start = portal.indexOf(marker);
const end = portal.indexOf('\n  });', start);
assert.ok(start >= 0 && end > start, 'premix guidance click handler exists');

let onClick;
const routes = [];
let refreshes = 0;
const form = { hidden: true, dataset: {} };
const product = { value: 'stale-product', disabled: false, _customSelectRefresh: () => { refreshes += 1; } };
const type = {
  value: 'sale',
  _customSelectRefresh: () => { refreshes += 1; },
  dispatchEvent: () => { product.value = ''; product.disabled = type.value === 'premix'; },
};
const newRecipe = { disabled: false, click: () => { form.hidden = false; type.value = 'sale'; product.disabled = false; } };
const nodes = new Map([
  ['#premix-empty-guidance', { addEventListener: (_name, handler) => { onClick = handler; } }],
  ['#new-recipe', newRecipe], ['#recipe-form', form], ['#recipe-type', type], ['#recipe-product', product],
]);
vm.runInNewContext(portal.slice(start, end + '\n  });'.length), {
  document: { querySelector: (selector) => nodes.get(selector) },
  Event: class { constructor(name) { this.type = name; } },
  setInventoryView: (view) => routes.push(view),
  loadPremixData: () => { throw new Error('unexpected retry'); },
});
const createEvent = { target: { closest: (selector) => selector === '[data-premix-create-recipe]' ? {} : null } };
onClick(createEvent);
assert.deepEqual(routes, ['recipes']);
assert.equal(form.hidden, false);
assert.equal(type.value, 'premix');
assert.equal(product.value, '');
assert.equal(product.disabled, true);
assert.equal(refreshes, 2, 'both custom selects must reflect the preset');

form.hidden = true;
form.dataset.submitting = '1';
onClick(createEvent);
assert.deepEqual(routes, ['recipes'], 'pending editor must not be replaced');
assert.equal(form.hidden, true);

console.log('PREMIX CREATE ROUTE QA: PASS (preset, product lock, pending guard)');

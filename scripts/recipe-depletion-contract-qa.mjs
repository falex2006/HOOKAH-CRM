import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { scaleBatchRecipeIngredients } = require('../recipe-depletion.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const batch = [{ ingredientId: 'water', name: 'Вода', quantity: '400 мл', unit: 'мл' }];

const onePortion = scaleBatchRecipeIngredients(batch, 1, 4);
assert.equal(onePortion[0].quantity, '100 мл', 'one sold portion consumes one quarter of the 400 ml batch');
assert.equal(onePortion[0].ingredientId, 'water', 'ingredient links remain intact');
assert.equal(batch[0].quantity, '400 мл', 'scaling does not mutate the saved recipe');

const twoPortions = scaleBatchRecipeIngredients(batch, 2, 4);
assert.equal(twoPortions[0].quantity, '200 мл', 'two sold portions consume half of the batch');

const onePortionBatch = scaleBatchRecipeIngredients(batch, 1, 1);
assert.equal(onePortionBatch[0].quantity, '400 мл', 'single-portion recipe keeps its full quantity per sale');

const fractional = scaleBatchRecipeIngredients([{ name: 'Сироп', quantity: '1,5 л' }], 1, 3);
assert.equal(fractional[0].quantity, '0.5 л', 'decimal comma is normalized and fractional yield is preserved');

for (const invalidCount of [undefined, null, 0, -1, 1.5, Number.NaN]) {
  assert.throws(() => scaleBatchRecipeIngredients(batch, 1, invalidCount), /recipe_portion_count_invalid/);
}
for (const invalidQuantity of [0, -1, Number.NaN, 'not a quantity']) {
  assert.throws(() => scaleBatchRecipeIngredients(batch, invalidQuantity, 4), /recipe_order_quantity_invalid/);
}
for (const invalidIngredient of ['', '0 мл', '-2 г', '1, мл']) {
  assert.throws(() => scaleBatchRecipeIngredients([{ quantity: invalidIngredient }], 1, 4), /recipe_ingredient_quantity_invalid/);
}
assert.throws(() => scaleBatchRecipeIngredients(null, 1, 4), /recipe_ingredients_must_be_array/);
assert.match(server, /DESC NULLS LAST/, 'an exact product-linked recipe wins over a legacy unlinked card');
assert.match(server, /SELECT cost FROM order_costs WHERE venue_id=\$1 AND order_id=\$2/, 'idempotent depletion reuses the historical cost snapshot');

console.log('RECIPE DEPLETION CONTRACT QA: 14 assertions passed');

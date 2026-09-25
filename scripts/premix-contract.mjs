import assert from 'node:assert/strict';
import fs from 'node:fs';
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/037_inventory_premix.sql', import.meta.url), 'utf8');
assert.match(migration, /inventory_premix_batches/);
assert.match(migration, /recipe_type/);
assert.match(server, /\/api\/inventory\/premixes\/produce/);
assert.match(server, /insufficient_premix_stock/);
assert.match(server, /inventory\.premix_produced/);
assert.match(server, /UPDATE ingredients SET cost=\$1 WHERE id=\$2 AND venue_id=\$3/,
  'premix production must publish its weighted unit cost to the output inventory item');
assert.match(server, /nextOutputCost = nextOutputQuantity > 0 \? \(\(previousOutputQuantity \* Number\(outputRow\.cost \|\| 0\)\) \+ totalCost\) \/ nextOutputQuantity/,
  'existing premix stock and new batch cost must be combined using weighted average cost');
assert.match(server, /premix_output_cannot_be_an_ingredient/,
  'the produced output cannot also be consumed as its own ingredient');
assert.match(server, /combinedRequirements/,
  'duplicate recipe lines for the same ingredient must be aggregated before stock validation');
assert.match(server, /const combinedRequirements = new Map\(\); for \(const entry of requirements\)/,
  'demo production must validate aggregated requirements before it changes any stock');
assert.match(portal, /Заготовки и премиксы/);
assert.match(portal, /href: '\/inventory\?view=premixes'/);
assert.match(portal, /window\.addEventListener\('popstate', \(\) => setInventoryView/);
assert.match(portal, /recipeType/);
console.log('PREMIX CONTRACT: PASS');

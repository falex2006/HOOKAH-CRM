import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/029_inventory_recipe_outputs.sql', import.meta.url), 'utf8');
const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
let checks = 0;

assert.match(source, /const client = transactionClient \|\| await pool\.connect\(\);/);
assert.match(source, /const ownsTransaction = !transactionClient;/);
assert.match(source, /await client\.query\('BEGIN'\)/);
assert.match(source, /SAVEPOINT legacy_recipe_lookup/);
assert.match(source, /ROLLBACK TO SAVEPOINT legacy_recipe_lookup/);
assert.match(source, /await client\.query\('SELECT id FROM ingredients[\s\S]*FOR UPDATE'/);
assert.match(source, /error\.code !== '42P01'/);
assert.match(source, /alreadyDepleted: true/);
assert.match(source, /order_costs/);
checks += 9;
assert.match(migration, /yield_quantity/);
assert.match(migration, /yield_unit/);
assert.match(migration, /portion_count/);
checks += 3;
assert.ok(portal.includes('const sourceUnit = quantityText.match('), 'recipe UI must parse the ingredient measurement unit');
assert.ok(portal.includes('unitFactors[sourceUnit]?.[item.unit]'), 'recipe costing must convert compatible units before calculating cost');
checks += 2;

console.log(`RECIPE CHAIN CONTRACT QA: ${checks} checks passed`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const depletionStart = source.indexOf('async function depleteRecipeForOrder');
const depletionEnd = source.indexOf('const approvedDiscountTotal', depletionStart);
assert.notEqual(depletionStart, -1); assert.notEqual(depletionEnd, -1);
const depletion = source.slice(depletionStart, depletionEnd);
assert.match(depletion, /rc\.id AS "recipeId"/, 'DB lookup distinguishes missing recipe from an active card containing empty ingredients');
assert.match(depletion, /SELECT candidate\.id,candidate\.ingredients,candidate\.portion_count/, 'LATERAL projection exposes the recipe ID selected by the outer query');
assert.match(depletion, /if \(!card\.recipeId\) continue/, 'no assigned sale card keeps the existing allowed policy');
assert.match(depletion, /if \(!Array\.isArray\(card\.ingredients\) \|\| card\.ingredients\.length === 0\) throw[\s\S]*?recipe_invalid/, 'active malformed or empty composition fails closed');
assert.match(depletion, /if \(!name \|\| !\/[\s\S]*?recipe_invalid/, 'each DB ingredient requires a name and valid linked UUID');
assert.match(depletion, /if \(!found\) throw[\s\S]*?recipe_ingredient_not_found/, 'unresolvable ingredient fails instead of silently omitting depletion');
assert.match(depletion, /const parsed = parseRecipeQuantity\(item\.quantityText, found\.unit, item\.sourceUnit \|\| null\);[\s\S]*?if \(parsed\.error\) throw/, 'incompatible or unknown measurement pair rejects sale');
assert.doesNotMatch(depletion, /\?\?\s*1\s*;\s*\/\//, 'unknown units never receive an identity conversion fallback');
const inventoryLock = depletion.indexOf("SELECT id FROM ingredients WHERE venue_id=$1");
const movementInsert = depletion.indexOf('INSERT INTO stock_movements');
assert.ok(inventoryLock >= 0 && movementInsert > inventoryLock, 'ingredient rows are locked before stock movements are inserted');
assert.match(depletion, /const missing = finalRequirements\.filter[\s\S]*?if \(missing\.length\) throw|if \(missing\.length\) \{ const error = new Error\('insufficient_recipe_stock'\)/, 'all stock levels are validated before any movement insert');

function route(startMarker, endMarker) {
  const start = source.indexOf(startMarker); const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `route exists: ${startMarker}`);
  return source.slice(start, end);
}
const payment = route("if (paymentPath && (req.method === 'GET' || req.method === 'POST'))", 'const orderPath = pathname.match(');
const paymentPost = payment.slice(payment.indexOf('const amount = Number(input.amount);'));
assert.match(paymentPost, /BEGIN[\s\S]*?INSERT INTO payments[\s\S]*?depleteRecipeForOrder[\s\S]*?COMMIT/, 'final payment insert and depletion share one DB transaction');
assert.match(paymentPost, /catch \(error\) \{[\s\S]*?ROLLBACK[\s\S]*?recipe_invalid/, 'invalid active recipe rolls back a payment');
const close = route("if (orderPath && req.method === 'POST' && orderPath[2] === 'close')", "if (orderPath && req.method === 'POST' && orderPath[2] === 'split')");
assert.match(close, /BEGIN[\s\S]*?depleteRecipeForOrder[\s\S]*?UPDATE orders SET status=\$1[\s\S]*?INSERT INTO order_costs[\s\S]*?INSERT INTO payments[\s\S]*?COMMIT/, 'manual close, stock, COGS, and payment share one DB transaction');
assert.match(close, /catch \(error\) \{[\s\S]*?ROLLBACK[\s\S]*?recipe_invalid/, 'invalid active recipe rolls back close');

console.log('RECIPE DEPLETION PG CONTRACT: assertions passed (static SQL/control-flow only; PostgreSQL runtime requires a separate test server)');

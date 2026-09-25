import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf("if (orderPath && req.method === 'POST' && orderPath[2] === 'close')");
const end = source.indexOf("if (orderPath && req.method === 'POST' && orderPath[2] === 'split')", start);
assert.notEqual(start, -1, 'PostgreSQL order close route exists');
assert.notEqual(end, -1, 'transaction test can isolate the close route');
const closeRoute = source.slice(start, end);
const cardsStart = source.indexOf('LEFT JOIN LATERAL (', source.indexOf('async function depleteRecipeForOrder'));
const cardsEnd = source.indexOf(') rc ON true', cardsStart);
const recipeLookup = source.slice(cardsStart, cardsEnd);
assert.match(recipeLookup, /candidate\.product_id=oi\.product_id OR \(candidate\.product_id IS NULL AND lower\(candidate\.name\)=lower\(p\.name\)\)/, 'name fallback cannot select a card linked to another product');
assert.match(recipeLookup, /ORDER BY \(candidate\.product_id=oi\.product_id\) DESC/, 'exact product-linked cards take precedence over name fallback');

const at = (pattern, label) => {
  const match = closeRoute.match(pattern);
  assert.ok(match, `${label} is present in the close route`);
  return match.index;
};

const begin = at(/await client\.query\('BEGIN'\)/, 'transaction begins');
const lock = at(/SELECT id,status,table_id AS "tableId",vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=\$1 AND venue_id=\$2 FOR UPDATE/, 'order row is locked');
const depletion = at(/depleteRecipeForOrder\(repositories\.pool, orderPath\[1\], venueDbId, req\.user\?\.id, client\)/, 'depletion uses the active transaction client');
const close = at(/UPDATE orders SET status=\$1,closed_at=now\(\)/, 'order closes transactionally');
const orderCost = at(/INSERT INTO order_costs \(venue_id,order_id,cost\)/, 'COGS snapshot is inserted transactionally');
const payment = at(/INSERT INTO payments \(order_id,method,amount,status\)/, 'payment is inserted transactionally');
const table = at(/UPDATE tables t SET status=CASE/, 'table release is transactional');
const commit = at(/await client\.query\('COMMIT'\)/, 'transaction commits');
const audit = at(/recordAudit\(req, 'order\.closed'/, 'audit event is emitted');

assert.ok(begin < lock && lock < depletion, 'lock is acquired before stock depletion');
assert.ok(depletion < close && close < orderCost && orderCost < payment && payment < table && table < commit, 'all close effects occur before commit');
assert.ok(commit < audit, 'audit is emitted only after successful commit');
assert.match(closeRoute, /\['closed', 'cancelled'\]\.includes\(persisted\.status\)[\s\S]*?ROLLBACK[\s\S]*?json\(res, 409, \{ error: 'order_already_final' \}\)/, 'already-final orders roll back and retain the existing conflict response');
assert.match(closeRoute, /ROLLBACK[\s\S]*?error\.message === 'insufficient_recipe_stock'[\s\S]*?error: 'insufficient_recipe_stock'/, 'insufficient stock rolls back and retains its response contract');
assert.match(closeRoute, /SELECT id,status,[^\n]+FOR UPDATE/, 'concurrent closes serialize on the order row');
assert.match(closeRoute, /finally\s*\{\s*client\?\.release\(\);\s*\}/, 'transaction client is always released');
assert.doesNotMatch(closeRoute, /repositories\.pool\.query\(/, 'route does not escape the transaction with pool-level queries');

const paymentStart = source.indexOf("if (paymentPath && (req.method === 'GET' || req.method === 'POST'))");
const paymentEnd = source.indexOf('const orderPath = pathname.match(', paymentStart);
assert.notEqual(paymentStart, -1, 'payments API exists');
assert.notEqual(paymentEnd, -1, 'test can isolate payments API');
const paymentRoute = source.slice(paymentStart, paymentEnd);
const paymentPost = paymentRoute.slice(paymentRoute.indexOf('const input = await body(req)'));
const paymentAt = (pattern, label) => {
  const match = paymentRoute.match(pattern);
  assert.ok(match, `${label} is present in the payments route`);
  return match.index;
};
const paymentBegin = paymentAt(/await client\.query\('BEGIN'\)/, 'payment transaction begins');
const paymentLock = paymentAt(/SELECT id,status,table_id AS "tableId",vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=\$1 AND venue_id=\$2 FOR UPDATE/, 'payment locks the order row');
const paymentInsert = paymentAt(/INSERT INTO payments \(order_id,method,amount,status\)/, 'payment insert uses transaction client');
const paymentDepletion = paymentAt(/depleteRecipeForOrder\(repositories\.pool, paymentPath\[1\], venueDbId, req\.user\?\.id, client\)/, 'final payment depletion uses transaction client');
const paymentClose = paymentAt(/UPDATE orders SET status=\\'closed\\',closed_at=now\(\)/, 'final payment closes order transactionally');
const paymentCost = paymentAt(/INSERT INTO order_costs \(venue_id,order_id,cost\)/, 'final payment records COGS transactionally');
const paymentTable = paymentAt(/UPDATE tables t SET status=CASE/, 'final payment releases table transactionally');
const paymentCommit = paymentAt(/await client\.query\('COMMIT'\)/, 'payment transaction commits');
const paymentAudit = paymentAt(/recordAudit\(req, 'order\.payment_added'/, 'payment audit emits after transaction');
assert.ok(paymentBegin < paymentLock && paymentLock < paymentInsert && paymentInsert < paymentCommit, 'payment is serialized and persisted in its transaction');
assert.ok(paymentInsert < paymentDepletion && paymentDepletion < paymentClose && paymentClose < paymentCost && paymentCost < paymentTable && paymentTable < paymentCommit, 'final payment, depletion, close, COGS, and table release are atomic');
assert.ok(paymentCommit < paymentAudit, 'payment audit follows a successful commit');
assert.match(paymentRoute, /if \(closed\) \{[\s\S]*?depleteRecipeForOrder/, 'partial payments do not trigger stock depletion');
assert.match(paymentRoute, /ROLLBACK[\s\S]*?error\.message === 'insufficient_recipe_stock'[\s\S]*?error: 'insufficient_recipe_stock'/, 'insufficient stock rolls back final payment and retains response contract');
assert.match(paymentRoute, /ROLLBACK[\s\S]*?error: 'payment_exceeds_due'/, 'overpayment rolls back and retains response contract');
assert.match(paymentRoute, /persisted\.status === 'closed' \|\| persisted\.status === 'cancelled'[\s\S]*?ROLLBACK[\s\S]*?order_already_final/, 'finalized orders reject concurrent payment/close');
assert.doesNotMatch(paymentPost, /repositories\.pool\.query\(/, 'payment POST has no out-of-transaction database queries');

console.log('ORDER/PAYMENT TRANSACTION QA: assertions passed');

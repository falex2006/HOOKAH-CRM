import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

for (const label of ['Позиция', 'Цех / категория', 'Остаток', 'Минимум', 'Состояние', 'Действия']) {
  assert.ok(portal.includes(`data-label="${label}"`), `stock card label is missing: ${label}`);
}
for (const label of ['Позиция', 'Остаток', 'Минимум', 'К заказу', 'Поставщик', 'Оценка']) {
  assert.ok(portal.includes(`data-label="${label}"`), `replenishment card label is missing: ${label}`);
}
assert.match(css, /@media\(max-width:1000px\)\{[\s\S]*?\.inventory-stock-panel tbody tr\{display:grid/,
  'stock view must switch to labeled cards on constrained tablet/Fold widths');
assert.match(css, /@media\(max-width:1100px\)\{[\s\S]*?\.auto-order-table-wrap tbody tr\{display:grid/,
  'replenishment view must switch to labeled cards on constrained tablet/Fold widths');
assert.match(css, /\.inventory-stock-panel table\{display:block;width:100%;min-width:0/,
  'mobile stock cards must not retain the desktop minimum width');
assert.match(css, /\.auto-order-table-wrap table\{display:block;width:100%;min-width:0/,
  'mobile replenishment cards must not retain the desktop minimum width');
assert.match(css, /@media\(max-width:560px\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/,
  'phone-width warehouse cards must collapse to one column');
assert.match(css, /@media\(max-width:900px\)\{\.velora-theme \.inventory-tabs\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\.velora-theme \.inventory-tabs button:last-child\{grid-column:1\/-1;justify-self:center\}\}/,
  'the final warehouse tab must span the last row so the tablet layout stays balanced');
assert.match(css, /@media\(max-width:900px\)[\s\S]*?button:last-child\{grid-column:1\/-1;justify-self:center\}/,
  'the final tablet tab must be visually centered within its final row');
assert.match(css, /@media\(min-width:651px\) and \(max-width:1000px\)\{[\s\S]*?inventory-tabs\+\.kpi-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  'Fold/tablet KPI tiles must remain in a single balanced row');
assert.match(css, /@media\(min-width:901px\) and \(max-width:1400px\)\{[\s\S]*?inventory-page-title>\.toolbar-row\{display:flex;width:auto/,
  'laptop warehouse actions should retain compact intrinsic widths');
assert.match(css, /inventory-tabs button:nth-child\(5\)\{grid-column:2\}/,
  'the second row of warehouse tabs should be centered when it has three items');
assert.match(css, /\.inventory-stock-panel \.inventory-item-edit\{min-height:44px/,
  'stock card actions must meet the touch target on constrained screens');
assert.match(css, /\.inventory-departments button\{min-height:44px/,
  'department filters must meet the touch target on constrained screens');
assert.match(css, /td\.auto-order-check-col\{display:flex;align-items:center;justify-content:center;gap:7px;box-sizing:border-box;width:auto;min-width:92px;min-height:44px/,
  'auto-order selection must be a clear touch-sized control on constrained screens');
assert.match(css, /td\.auto-order-check-col::after\{content:'В заявку'/,
  'auto-order checkbox must explain its action on constrained screens');

console.log('INVENTORY RESPONSIVE CONTRACT: PASS');

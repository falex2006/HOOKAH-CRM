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
for (const requirement of ['Приёмка по документу', 'Поставщик', 'Номер документа', 'Дата накладной', 'Добавить позицию', 'Сохранить черновик', 'Провести поступление', 'purchase-documents']) {
  assert.ok(portal.includes(requirement), `documented receiving workflow is missing: ${requirement}`);
}
assert.match(portal, /Черновик сохранён\. Остаток изменится после проведения\./,
  'saving a draft must clearly state that stock has not moved yet');
assert.match(portal, /allItems = data\.items \|\| \[\]; renderPurchaseLines\(/,
  'purchase item options must refresh after inventory finishes loading asynchronously');
assert.match(portal, /В учёт поступит|В учёт поступит /,
  'each purchase line must show its normalized stock quantity');
assert.match(css, /\.purchase-line\{display:grid;grid-template-columns:/,
  'purchase lines must have a structured desktop layout');
assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.purchase-line\{grid-template-columns:minmax\(0,1fr\)/,
  'purchase lines must collapse into a single-column phone layout');
assert.match(css, /button\.button:not\(\.primary\):not\(\.danger\):not\(\.danger-outline\)\{background:#20242a;border:1px solid/,
  'neutral buttons must keep a visible premium control surface');

console.log('INVENTORY RESPONSIVE CONTRACT: PASS');

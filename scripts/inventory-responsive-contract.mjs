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
assert.doesNotMatch(portal, /class="inventory-tabs"/, 'warehouse views must not duplicate the sidebar navigation inside the page');
assert.match(css, /@media\(min-width:651px\) and \(max-width:1000px\)\{\.velora-theme \.kpi-grid\.compact\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  'Fold/tablet KPI tiles must remain in a single balanced row');
assert.match(css, /@media\(min-width:901px\) and \(max-width:1400px\)\{[\s\S]*?inventory-page-title>\.toolbar-row\{display:flex;width:auto/,
  'laptop warehouse actions should retain compact intrinsic widths');
assert.match(css, /\.sidebar-nav-group:not\(\[open\]\)>summary\.has-active-child\{color:#f3f5f7;background:#1d2027;border-radius:10px/,
  'a collapsed inventory group must still indicate that one of its child routes is active');
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
assert.match(portal, /purchasePanel\.querySelectorAll\('label:has\(:required\)'\)/,
  'required receiving fields must be visibly identified from their actual validation state');
assert.match(portal, /insertBefore\(purchasePanel, inventoryContentGrid\)/,
  'document receiving must appear before adjustment operations in the warehouse workflow');
assert.match(css, /\.purchase-document-form \.required-mark\{color:#ff7180;font-weight:800\}/,
  'required receiving markers must use the shared required-field treatment');
assert.match(css, /\.purchase-line\{display:grid;grid-template-columns:/,
  'purchase lines must have a structured desktop layout');
assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.purchase-line\{grid-template-columns:minmax\(0,1fr\)/,
  'purchase lines must collapse into a single-column phone layout');
assert.match(css, /button\.button:not\(\.primary\):not\(\.danger\):not\(\.danger-outline\)\{background:#20242a;border:1px solid/,
  'neutral buttons must keep a visible premium control surface');
assert.match(css, /@media\(max-width:980px\)\{\.velora-theme \.purchase-lines-head>\.button,\.velora-theme \.purchase-document-row>\.toolbar-row>\.button\{min-height:44px\}\}/,
  'receiving actions must meet the touch target on Fold/tablet widths');

console.log('INVENTORY RESPONSIVE CONTRACT: PASS');

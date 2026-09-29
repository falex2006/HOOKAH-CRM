import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const portal = fs.readFileSync(new URL('portal.js', root), 'utf8');
const css = fs.readFileSync(new URL('style.css', root), 'utf8');
const finance = portal.slice(portal.indexOf('function renderFinance()'), portal.indexOf('function renderFinanceReport()'));

for (const [field, label] of [
  ['expense-category', 'Категория'],
  ['expense-amount', 'Сумма'],
  ['expense-date', 'Дата'],
]) {
  const control = field === 'expense-category' ? 'select' : 'input';
  assert.match(finance, new RegExp(`label>${label} <span class="required-mark">\\*</span><${control} id="${field}"`),
    `${label} must keep its required marker adjacent to the field label`);
}

assert.match(css, /\.finance-expenses-panel #expense-form>\.form-row label\{[^}]*display:flex;[^}]*flex-wrap:wrap;[^}]*align-items:baseline/,
  'expense row labels must lay out the label text and required marker inline');
assert.match(css, /\.finance-expenses-panel #expense-form>\.form-row label>:is\(input,select\)\{[^}]*flex:0 0 100%;[^}]*width:100%/,
  'expense inputs and the catalog selector must occupy the next full row after their inline label');

assert.match(finance, /class="toolbar-row finance-payroll-filters"[\s\S]*?id="payroll-filter-from"[\s\S]*?id="payroll-filter-to"[\s\S]*?id="payroll-filter-user"[\s\S]*?id="payroll-filter-rule"[\s\S]*?id="payroll-reload"/,
  'payroll filters must stay in a single semantic group in a stable order');
assert.match(css, /\.finance-payroll-filters\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\) auto;[^}]*align-items:end/,
  'payroll filters need aligned desktop columns');
assert.match(css, /\.finance-payroll-filters>label\{display:grid;gap:6px/,
  'payroll filter captions must sit above their controls instead of running inline');
assert.match(css, /@media\(max-width:1000px\)\{\.velora-theme \.finance-payroll-filters\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/,
  'payroll filters must use two columns on compact layouts');
assert.match(css, /@media\(max-width:620px\)\{\.velora-theme \.finance-payroll-filters\{grid-template-columns:minmax\(0,1fr\)\}/,
  'payroll filters must stack on phones');
assert.match(css, /#expense-document::file-selector-button\{min-height:32px;[^}]*border-radius:8px/,
  'expense document picker button must match the CRM input style');

console.log('FINANCE REQUIRED MARKER CONTRACT: PASS (expense labels, payroll filters and document picker layout)');

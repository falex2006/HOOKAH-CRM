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
  assert.match(finance, new RegExp(`label>${label} <span class="required-mark">\\*</span><input id="${field}"`),
    `${label} must keep its required marker adjacent to the field label`);
}

assert.match(css, /\.finance-expenses-panel #expense-form>\.form-row label\{[^}]*display:flex;[^}]*flex-wrap:wrap;[^}]*align-items:baseline/,
  'expense row labels must lay out the label text and required marker inline');
assert.match(css, /\.finance-expenses-panel #expense-form>\.form-row label>input\{[^}]*flex:0 0 100%;[^}]*width:100%/,
  'expense inputs must occupy the next full row after their inline label');

console.log('FINANCE REQUIRED MARKER CONTRACT: PASS (category, amount, date labels remain inline)');

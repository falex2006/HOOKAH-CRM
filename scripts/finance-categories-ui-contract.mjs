import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portal = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');
const start = portal.indexOf('function renderFinanceCategories()');
const end = portal.indexOf('function renderFinance()', start);
assert.ok(start >= 0 && end > start, 'finance category page implementation is available');
const ui = portal.slice(start, end);

assert.match(portal, /document\.addEventListener\('submit', \(event\) => \{[^\n]*\}, 6000\); \}\);/,
  'generic form pending state must run after the form-specific submit handler');

assert.match(ui, /const reset = \(\) => \{[\s\S]*?message\.textContent = '';[\s\S]*?message\.className = 'form-message'/,
  'closing or reopening an editor clears its former validation message');
assert.match(ui, /form\.addEventListener\('submit', \(event\) => \{ event\.preventDefault\(\); if \(categoryMutationPending\) return;[\s\S]*?setCategoryMutationPending\(true\);[\s\S]*?\.finally\(\(\) => \{ setCategoryMutationPending\(false\); \}\)/,
  'a category save blocks parallel editor actions and restores them after completion');
assert.match(ui, /const requestId = \+\+categoryLoadRequestId;[\s\S]*?if \(requestId !== categoryLoadRequestId\) return false;/,
  'late category GET responses cannot overwrite a newer filter');
assert.match(ui, /data-finance-category-retry/,
  'a failed category read offers an in-page retry');
assert.match(ui, /if \(!item\) return; reset\(\); form\.hidden = false;[\s\S]*?finance-category-id/,
  'editing another row begins from a clean editor state');
assert.match(ui, /includeArchived=true/,
  'the status filter requests archived categories when asked');
assert.match(ui, /item\.active === false \? 'В архиве'/,
  'archived categories have an explicit status');
assert.match(ui, /item\.active === false \? 'Восстановить' : 'Архивировать'/,
  'archived categories can be restored');

console.log('FINANCE CATEGORIES UI CONTRACT: PASS (clean editor state, single-submit protection, archive lifecycle)');

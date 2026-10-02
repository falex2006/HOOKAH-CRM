import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
assert.match(app, /let products=staticStaffDemo\(\)\?demoProducts:\[\]/, 'only the intentionally static demo workspace may start with the built-in sample catalog');
assert.match(app, /let catalogState=staticStaffDemo\(\)\?'ready':'loading'/, 'the server-backed catalog must begin in a loading state');
assert.match(app, /const payload=await staffFetchJson\('\/api\/products'\)/, 'catalog reads use the shared checked API boundary');
const boundaryStart = app.indexOf('const staffFetchJson=async');
const boundaryEnd = app.indexOf('const staffRoleLabels=', boundaryStart);
assert.ok(boundaryStart >= 0 && boundaryEnd > boundaryStart);
assert.match(app.slice(boundaryStart, boundaryEnd), /if\(!response\.ok\)\{[\s\S]*error\.status=response\.status;throw error;/, 'shared API rejects failed responses before any sample catalog can be preserved');
assert.match(app, /if\(!Array\.isArray\(payload\?\.items\)\)throw new Error\('catalog_invalid_response'\)/, 'the catalog requires an explicit API item list');
assert.match(app, /products=payload\.items\.map[\s\S]*?catalogState='ready'/, 'an empty successful API response must become the real empty catalog');
assert.match(app, /catch\(_\)\{products=\[\];catalogState='error';\}/, 'a failed API response must clear all fallback items');
assert.match(app, /if\(e\.target\.closest\('\.catalog-retry'\)\)\{if\(!catalogAddPending\)loadProducts\(\);return;\}/, 'catalog failure must expose a retry action without overlapping an add');

const drawStart = app.indexOf("function draw(q='')");
const loadStart = app.indexOf('async function loadProducts', drawStart);
assert.ok(drawStart >= 0 && loadStart > drawStart, 'catalog renderer and loader are present');
const drawSource = app.slice(drawStart, loadStart).trim();
const normalizeSearch = (value) => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escapeFloorText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const displayProductName = value => String(value ?? '').trim().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toLocaleUpperCase('ru-RU'));
const staffIcon = () => '<svg aria-hidden="true"></svg>';
const render = (state, items = [], query = '') => {
  const grid = { innerHTML: '' };
  const draw = new Function('grid', 'catalogState', 'products', 'normalizeSearch', 'escapeFloorText', 'displayProductName', 'staffIcon', 'catalogAddPending', `${drawSource}; return draw;`)(grid, state, items, normalizeSearch, escapeFloorText, displayProductName, staffIcon, false);
  draw(query);
  return grid.innerHTML;
};

const loading = render('loading');
assert.match(loading, /role="status"/);
assert.doesNotMatch(loading, /class="product"/);
const failed = render('error');
assert.match(failed, /role="alert"/);
assert.match(failed, /class="button small catalog-retry"/);
const empty = render('ready', []);
assert.match(empty, /Каталог пока пуст/);
assert.doesNotMatch(empty, /class="product"/);
const maliciousName = 'Комбо "Тест" <img src=x onerror=1>';
const populated = render('ready', [[maliciousName, 250, [], null, 'product-uuid']]);
assert.match(populated, /data-id="product-uuid"/);
assert.doesNotMatch(populated, /<img src=x onerror=1>/);
assert.match(populated, /&lt;img src=x onerror=1&gt;/);

console.log('STAFF CATALOG LOAD STATE CONTRACT: PASS (loading, empty, error/retry, server IDs and escaped product names)');

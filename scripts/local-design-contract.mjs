import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html'));
assert.ok(htmlFiles.length >= 14, 'all application HTML routes should be present');
const syncScript = readFileSync(new URL('../scripts/sync-published-assets.mjs', import.meta.url), 'utf8');
const cssRevision = Number(syncScript.match(/cssRevision = '(\d+)'/)?.[1]);
const portalRevision = Number(syncScript.match(/portalRevision = '(\d+)'/)?.[1]);
const appRevision = Number(syncScript.match(/appRevision = '(\d+)'/)?.[1]);
assert.ok(Number.isInteger(cssRevision) && Number.isInteger(portalRevision), 'published asset revisions must be declared in the sync script');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(appSource, /Math\.floor\(rawX\/190\)\*4\)\+1/, 'floor editor pixel positions must map to spaced 12-column grid starts');
assert.match(appSource, /Math\.floor\(rawY\/125\)\*3\)\+1/, 'floor editor pixel positions must map to spaced grid rows');
assert.match(appSource, /Math\.round\(rawW\/50\)/, 'floor editor widths must map to three-column table spans');
for (const file of htmlFiles) {
  const html = readFileSync(new URL(file, root), 'utf8');
  assert.match(html, new RegExp(`style\\.css\\?rev=${cssRevision}`), `${file} must use current CSS cache version`);
  assert.doesNotMatch(html, /style\.css\?rev=(?:12[0-7]|1[01]\d)/, `${file} has stale CSS cache version`);
  if (file !== 'index.html' && file !== 'login.html' && file !== 'platform.html') assert.match(html, new RegExp(`portal\\.js\\?rev=${portalRevision}`), `${file} must use current portal JS cache version`);
  if (file === 'index.html') assert.match(html, new RegExp(`app\\.js\\?rev=${appRevision}`), 'index.html must use current staff app JS cache version');
  if (file === 'index.html') assert.match(html, /assets\/tabler-icons\.svg\?rev=3#table-layout/, 'staff workspace must use the refreshed icon sprite');
  if (file === 'platform.html') assert.match(html, /platform\.js\?rev=3/, 'platform.html must use platform JS');
}
const distRoot = new URL('../dist/', import.meta.url);
const distHtmlFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html')) distHtmlFiles.push(path);
  }
};
walk(distRoot);
assert.ok(distHtmlFiles.length >= htmlFiles.length, 'dist must contain all published HTML routes');
for (const fileUrl of distHtmlFiles) {
  const html = readFileSync(fileUrl, 'utf8');
  assert.match(html, new RegExp(`style\\.css\\?rev=${cssRevision}`), `${fileUrl.pathname} must use current CSS cache version`);
  if (!/\/login(?:\/|\.html)/.test(fileUrl.pathname) && !/\/platform(?:\/|\.html)/.test(fileUrl.pathname) && !fileUrl.pathname.endsWith('/dist/index.html')) {
    assert.match(html, new RegExp(`portal\\.js\\?rev=${portalRevision}`), `${fileUrl.pathname} must use current portal JS cache version`);
  }
}
for (const file of htmlFiles) {
  assert.equal(readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8'), readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    `flat dist/${file} must match its current source template`);
}
const routeAliases = {
  'admin/index.html': 'admin.html',
  'clients/index.html': 'clients.html',
  'delivery/index.html': 'delivery.html',
  'finance/index.html': 'finance.html',
  'finance/categories/index.html': 'finance-categories.html',
  'finance/report/index.html': 'finance-report.html',
  'integrations/index.html': 'integrations.html',
  'inventory/index.html': 'inventory.html',
  'login/index.html': 'login.html',
  'network/index.html': 'network.html',
  'orders/index.html': 'orders.html',
  'platform/index.html': 'platform.html',
  'reservations/index.html': 'reservations.html',
};
for (const [alias, source] of Object.entries(routeAliases)) {
  assert.equal(readFileSync(new URL(`../dist/${alias}`, import.meta.url), 'utf8'), readFileSync(new URL(`../${source}`, import.meta.url), 'utf8'),
    `directory route dist/${alias} must match source ${source}`);
}
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
assert.match(portal, /finance-categories-panel[\s\S]*?finance-category-filters/, 'finance category controls must have a page-specific responsive wrapper');
assert.match(css, /\.velora-theme \.finance-category-filters\{display:grid;grid-template-columns:minmax\(0,1\.35fr\) minmax\(180px,1fr\)/, 'finance category controls must share the available panel width');
assert.match(css, /@media\(max-width:900px\)\{\.velora-theme \.finance-categories-panel>\.panel-head\{display:grid;grid-template-columns:minmax\(0,1fr\)/, 'finance category panel header must stack on Fold-sized viewports');
assert.match(css, /@media\(max-width:520px\)\{\.velora-theme \.finance-category-filters\{grid-template-columns:minmax\(0,1fr\)\}/, 'finance category controls must become a single column on phone widths');
assert.match(css, /\.platform-main>\.platform-content\{[^}]*width:100%[^}]*min-width:0[^}]*box-sizing:border-box/,
  'the platform workspace must respect the available width beside its sidebar');
assert.match(css, /@media\(max-width:1180px\)\{\.platform-hero\{align-items:flex-start;flex-direction:column\}\}/,
  'the platform hero must stack before tablet content is squeezed by the persistent sidebar');
assert.match(portal, /staffPanel\.classList\.add\('staff-directory-only'\)/, 'staff directory must mark the drawer-only layout');
assert.match(css, /\.staff-panel\.staff-directory-only \.staff-layout\{grid-template-columns:minmax\(0,1fr\);gap:0\}/, 'staff directory must reclaim the drawer column width');
assert.match(css, /\.velora-theme \.staff-row\.inactive\{grid-template-columns:34px minmax\(0,1fr\) 100px max-content max-content max-content\}/, 'inactive staff rows must reserve separate columns for restore and archive actions');
assert.match(css, /@media\(max-width:720px\)[\s\S]*?\.staff-row\.inactive\{grid-template-columns:34px minmax\(0,1fr\) max-content;grid-template-areas:[^}]*"avatar archive archive"\}/, 'inactive staff actions must wrap into named, non-overlapping areas on compact screens');
assert.match(css, /\.dashboard-kpi-grid>\.dashboard-revenue-card \.dashboard-revenue-main>strong\{[^}]*white-space:nowrap;overflow-wrap:normal\}/, 'dashboard revenue amount and currency must stay together on one line');
assert.match(css, /\.velora-theme a\.button[^}]*text-decoration:none!important/);
assert.match(css, /\.portal-nav a[^}]*text-decoration:none/);
for (const file of ['admin.html', 'orders.html', 'inventory.html']) {
  assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /assets\/tabler-icons\.svg/,
    `${file} must use Tabler Icons`);
}
console.log(`LOCAL DESIGN CONTRACT: PASS (routes=${htmlFiles.length}, dist routes=${distHtmlFiles.length}, CSS rev=${cssRevision}, portal rev=${portalRevision}, action links and Tabler Icons)`);




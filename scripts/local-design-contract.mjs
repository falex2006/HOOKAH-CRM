import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html'));
assert.ok(htmlFiles.length >= 14, 'all application HTML routes should be present');
const cssRevision = 225;
const portalRevision = 230;
for (const file of htmlFiles) {
  const html = readFileSync(new URL(file, root), 'utf8');
  assert.match(html, new RegExp(`style\\.css\\?rev=${cssRevision}`), `${file} must use current CSS cache version`);
  assert.doesNotMatch(html, /style\.css\?rev=(?:12[0-7]|1[01]\d)/, `${file} has stale CSS cache version`);
  if (file !== 'index.html' && file !== 'login.html' && file !== 'platform.html') assert.match(html, new RegExp(`portal\\.js\\?rev=${portalRevision}`), `${file} must use current portal JS cache version`);
  if (file === 'index.html') assert.match(html, /app\.js\?rev=116/, 'index.html must use current staff app JS cache version');
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
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(css, /\.velora-theme a\.button[^}]*text-decoration:none!important/);
assert.match(css, /\.portal-nav a[^}]*text-decoration:none/);
for (const file of ['admin.html', 'orders.html', 'inventory.html']) {
  assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /assets\/tabler-icons\.svg/,
    `${file} must use Tabler Icons`);
}
console.log(`LOCAL DESIGN CONTRACT: PASS (routes=${htmlFiles.length}, dist routes=${distHtmlFiles.length}, CSS rev=${cssRevision}, portal rev=${portalRevision}, action links and Tabler Icons)`);

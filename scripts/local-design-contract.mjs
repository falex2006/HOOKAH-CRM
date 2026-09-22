import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html'));
assert.ok(htmlFiles.length >= 14, 'all application HTML routes should be present');
for (const file of htmlFiles) {
  const html = readFileSync(new URL(file, root), 'utf8');
  assert.match(html, /style\.css\?rev=162/, `${file} must use current CSS cache version`);
  assert.doesNotMatch(html, /style\.css\?rev=(?:12[0-7]|1[01]\d)/, `${file} has stale CSS cache version`);
  if (file !== 'index.html' && file !== 'login.html' && file !== 'platform.html') assert.match(html, /portal\.js\?rev=144/, `${file} must use current portal JS cache version`);
  if (file === 'index.html') assert.match(html, /app\.js\?rev=105/, 'index.html must use current staff app JS cache version');
  if (file === 'platform.html') assert.match(html, /platform\.js\?rev=3/, 'platform.html must use platform JS');
}
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(css, /\.velora-theme a\.button[^}]*text-decoration:none!important/);
assert.match(css, /\.portal-nav a[^}]*text-decoration:none/);
for (const file of ['admin.html', 'orders.html', 'inventory.html']) {
  assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /assets\/tabler-icons\.svg/,
    `${file} must use Tabler Icons`);
}
console.log(`LOCAL DESIGN CONTRACT: PASS (routes=${htmlFiles.length}, CSS rev=161, action links and Tabler Icons)`);

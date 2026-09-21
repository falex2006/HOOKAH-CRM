import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html'));
assert.ok(htmlFiles.length >= 13, 'all application HTML routes should be present');
for (const file of htmlFiles) {
  const html = readFileSync(new URL(file, root), 'utf8');
  assert.match(html, /style\.css\?rev=128/, `${file} must use current CSS cache version`);
  assert.doesNotMatch(html, /style\.css\?rev=(?:12[0-7]|1[01]\d)/, `${file} has stale CSS cache version`);
}
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(css, /\.velora-theme a\.button[^}]*text-decoration:none!important/);
assert.match(css, /\.portal-nav a[^}]*text-decoration:none/);
for (const file of ['admin.html', 'orders.html', 'inventory.html']) {
  assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /assets\/tabler-icons\.svg/,
    `${file} must use Tabler Icons`);
}
console.log(`LOCAL DESIGN CONTRACT: PASS (routes=${htmlFiles.length}, CSS rev=128, action links and Tabler Icons)`);

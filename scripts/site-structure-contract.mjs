import fs from 'node:fs';
import assert from 'node:assert/strict';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const tree = fs.readFileSync(new URL('../SITE_TREE.md', import.meta.url), 'utf8');
const nginx = fs.readFileSync(new URL('../nginx/default.conf', import.meta.url), 'utf8');
const siteMap = JSON.parse(fs.readFileSync(new URL('../site-map.json', import.meta.url), 'utf8'));
const routes = {
  '/': 'index.html', '/login': 'login.html', '/admin': 'admin.html', '/orders': 'orders.html',
  '/clients': 'clients.html', '/reservations': 'reservations.html', '/delivery': 'delivery.html',
  '/inventory': 'inventory.html', '/finance': 'finance.html', '/finance/categories': 'finance-categories.html',
  '/finance/report': 'finance-report.html', '/integrations': 'integrations.html', '/network': 'network.html',
  '/platform': 'platform.html'
};
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [route, file] of Object.entries(routes)) {
  assert.match(server, new RegExp(`['\"]${escape(route)}['\"]\\s*:\\s*['\"]/${escape(file)}['\"]`), `missing route ${route}`);
  assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `missing page file ${file}`);
  assert.ok(tree.includes(`| \`${route}\` | \`${file}\``), `tree missing ${route}`);
}
assert.equal(siteMap.canonicalRoot, '/');
assert.equal(siteMap.adminRoot, '/admin');
assert.equal(siteMap.entries.length, Object.keys(routes).length);
for (const entry of siteMap.entries) {
  assert.equal(routes[entry.path], entry.file, `map mismatch ${entry.path}`);
  assert.ok(entry.title && entry.mode, `incomplete map entry ${entry.path}`);
}
assert.equal(siteMap.inventoryViews?.length, 7, 'inventory view map must enumerate every supported view');
assert.deepEqual(siteMap.inventoryViews.map((entry) => entry.view), ['products', 'recipes', 'stock', 'auto-orders', 'movements', 'premixes', 'directories']);
assert.deepEqual(siteMap.inventoryViews.filter((entry) => entry.group === 'menu').map((entry) => entry.view), ['products', 'recipes']);
assert.deepEqual(siteMap.inventoryViews.filter((entry) => entry.group === 'inventory').map((entry) => entry.view), ['stock', 'auto-orders', 'movements', 'premixes', 'directories']);
assert.match(tree, /\?view=auto-orders/);
for (const subroute of siteMap.adminSubroutes) assert.match(siteMap.entries.find((entry) => entry.path === '/admin')?.file || '', /admin\.html/);
assert.match(server, /canonicalByFile/);
assert.match(server, /Location: location/);
// Nginx owns trailing-slash normalization for the deployed reverse-proxy
// path. Keep the root URL intact while redirecting every nested slash form.
assert.match(nginx, /location\s+~\s+\^\(\.\+\)\/\+\$\s*\{/);
assert.match(nginx, /return\s+308\s+\$1\$is_args\$args;/);
console.log(`SITE STRUCTURE CONTRACT: PASS (${Object.keys(routes).length} canonical pages)`);

import fs from 'node:fs';
import assert from 'node:assert/strict';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const tree = fs.readFileSync(new URL('../SITE_TREE.md', import.meta.url), 'utf8');
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
assert.match(server, /canonicalByFile/);
assert.match(server, /Location: location/);
console.log(`SITE STRUCTURE CONTRACT: PASS (${Object.keys(routes).length} canonical pages)`);

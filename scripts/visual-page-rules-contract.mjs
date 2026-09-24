import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const rules = fs.readFileSync(new URL('VISUAL_PAGE_RULES.md', root), 'utf8');
const tree = fs.readFileSync(new URL('SITE_TREE.md', root), 'utf8');
const map = JSON.parse(fs.readFileSync(new URL('site-map.json', root), 'utf8'));
const requiredGlobal = [
  'DESIGN_TOKENS.md', 'prefers-reduced-motion', 'скроллбар', 'safe-area',
  '44px', 'Канонические адреса', 'Не добавлять новые цвета', 'Склад', 'Финансы'
];
for (const text of requiredGlobal) assert.ok(rules.includes(text), `visual rules missing global rule: ${text}`);
for (const entry of map.entries) {
  assert.ok(rules.includes('### `' + entry.path + '`'), `missing page rule ${entry.path}`);
  assert.ok(tree.includes('| `' + entry.path + '` |'), `page absent from site tree ${entry.path}`);
}
for (const subroute of map.adminSubroutes) assert.ok(rules.includes('`' + subroute + '`'), `missing admin rule ${subroute}`);
const headings = [...rules.matchAll(/^### `([^`]+)`/gm)].map((m) => m[1]);
assert.equal(new Set(headings).size, headings.length, 'duplicate page rule heading');
assert.equal(headings.length, map.entries.length, 'page rule count differs from canonical map');
console.log(`VISUAL PAGE RULES CONTRACT: PASS (${headings.length} canonical pages, ${map.adminSubroutes.length} admin subsections)`);

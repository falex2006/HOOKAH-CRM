import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const rules = fs.readFileSync(new URL('VISUAL_PAGE_RULES.md', root), 'utf8');
const css = fs.readFileSync(new URL('style.css', root), 'utf8');
const portal = fs.readFileSync(new URL('portal.js', root), 'utf8');
const warehousePrompt = fs.readFileSync(new URL('WAREHOUSE_PAGE_PROMPT.md', root), 'utf8');
const tree = fs.readFileSync(new URL('SITE_TREE.md', root), 'utf8');
const map = JSON.parse(fs.readFileSync(new URL('site-map.json', root), 'utf8'));
const requiredGlobal = [
  'DESIGN_TOKENS.md', 'prefers-reduced-motion', 'скроллбар', 'safe-area',
  '44px', 'Канонические адреса', 'Не добавлять новые цвета', 'Склад', 'Финансы', 'cross-document View Transition'
];
for (const text of requiredGlobal) assert.ok(rules.includes(text), `visual rules missing global rule: ${text}`);
for (const text of ['Остатки', 'Поставки и списания', 'Технологические карты', 'Каталог товаров', 'Понятны ли названия всех кнопок']) {
  assert.ok(warehousePrompt.includes(text), `warehouse prompt missing rule: ${text}`);
}
assert.match(rules, /WAREHOUSE_PAGE_PROMPT\.md/);
assert.match(rules, /Фильтры периода, поиска, статуса и сортировки имеют видимые подписи/,
  'guest filters must retain the labeled responsive layout rule');
assert.match(css, /@view-transition\s*\{\s*navigation:\s*auto;\s*\}/,
  'same-origin full-page navigation must use progressive cross-document transitions');
assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.staff-theme nav button\{transition:none!important;transform:none!important\}/,
  'staff navigation must not shift on hover when reduced motion is requested');
for (const name of ['root', 'crm-sidebar', 'crm-header']) {
  assert.ok(css.includes(`::view-transition-group(${name})`), `missing shared ${name} transition timing`);
}
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?::view-transition-group\(root\)[\s\S]*?animation:\s*none!important/,
  'cross-document transitions must respect reduced-motion preferences');
assert.doesNotMatch(portal, /requestAnimationFrame\(\(\)\s*=>\s*document\.querySelector\('#page-content'\)\?\.classList\.add\('crm-route-enter'\)\)/,
  'do not animate the empty initial content container on every full-page navigation');
assert.match(portal, /const animateRouteContent\s*=\s*\(\)\s*=>/,
  'in-page/hash section changes keep their local transition');
assert.match(rules, /значок стоит у заголовка группы; вложенные ссылки остаются текстовыми/,
  'visual rules must keep expanded sidebar groups calm and readable');
assert.deepEqual(map.navigationPresentation, {
  expandableGroupIcon: 'summary-only', childLinks: 'text-only', childTextAlignment: 'group-label'
}, 'the site map must document the canonical sidebar visual hierarchy');
assert.match(tree, /каждый раскрываемый раздел имеет свой значок в заголовке, а вложенные маршруты показываются текстом/,
  'the site tree must record the shared sidebar presentation rule');
assert.match(rules, /В `venue-layout-settings` сначала создаётся зал\/этаж, после чего открывается форма первого стола; пока залов нет, добавление стола и VIP-комнаты недоступно/,
  'the venue layout rule must preserve the hall-first table workflow');
assert.match(tree, /В `admin#venue-layout-settings` зал\/этаж создаётся первым; сохранение сразу предлагает добавить в него стол/,
  'the site tree must document the hall-to-table handoff');
assert.match(rules, /Выбор места сгруппирован по залам; у стола видны вместимость и депозит/,
  'reservation design rules must keep hall context and capacity visible while selecting a table');
assert.match(tree, /В форме бронирования столы сгруппированы по залам; рядом указаны вместимость и депозит/,
  'the site tree must document the hall-aware reservation selector');
for (const entry of map.entries) {
  assert.ok(rules.includes('### `' + entry.path + '`'), `missing page rule ${entry.path}`);
  assert.ok(tree.includes('| `' + entry.path + '` |'), `page absent from site tree ${entry.path}`);
}
for (const subroute of map.adminSubroutes) assert.ok(rules.includes('`' + subroute + '`'), `missing admin rule ${subroute}`);
const headings = [...rules.matchAll(/^### `([^`]+)`/gm)].map((m) => m[1]);
assert.equal(new Set(headings).size, headings.length, 'duplicate page rule heading');
assert.equal(headings.length, map.entries.length, 'page rule count differs from canonical map');
console.log(`VISUAL PAGE RULES CONTRACT: PASS (${headings.length} canonical pages, ${map.adminSubroutes.length} admin subsections)`);

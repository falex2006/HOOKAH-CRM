import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('style.css','utf8');
const portal=fs.readFileSync('portal.js','utf8');
const required=[
  ['Fold compact breakpoint', /@media\s*\(min-width:651px\)\s*and\s*\(max-width:900px\)/],
  ['Fold compact rail', /\.velora-theme \.portal-sidebar\{width:78px/],
  ['Fold workspace min-width', /\.velora-theme \.portal-main\{min-width:0/],
  ['Fixed-height navigation frame', /\.portal\.velora-theme \.portal-sidebar\{position:sticky[^}]*height:100vh/],
  ['Scrollable workspace only', /\.portal\.velora-theme \.portal-main\{height:100%;overflow-y:auto;overflow-x:hidden/],
  ['Safe area support', /env\(safe-area-inset-(left|right|bottom)\)/],
  ['Touch-size navigation', /\.velora-theme \.portal-sidebar \.portal-nav a\{width:52px;height:44px;min-height:44px/],
  ['Touch-size header controls', /\.velora-theme \.portal-header \.header-right[^}]*width:44px;height:44px/],
  ['Compact rail disclosure icons', /@media\(max-width:900px\)\{[\s\S]*?\.sidebar-nav-group>summary span\{display:none\}[\s\S]*?\.sidebar-nav-group>summary \.icon\{width:18px/],
  ['Fold rail can open a labeled navigation drawer', /@media \(min-width:651px\) and \(max-width:900px\)\{[\s\S]*?\.sidebar-mobile-toggle\{display:grid[\s\S]*?\.portal-sidebar\.is-expanded\{position:fixed[\s\S]*?\.portal-sidebar\.is-expanded \.portal-nav a\{display:flex;align-items:center;gap:12px;width:auto;height:auto/],
  ['Fold menu toggle avoids covering the brand and remains a close control', /\.sidebar-mobile-toggle\{display:grid;position:fixed;z-index:30;left:18px;top:72px[\s\S]*?\.sidebar-mobile-toggle\[aria-expanded="true"\]\{left:224px;top:22px\}/],
  ['Icon-only rail links retain accessible labels', /const linkLabel = link\.querySelector\('span'\)\?\.textContent\.trim\(\) \|\| link\.textContent\.trim\(\);[\s\S]*?link\.setAttribute\('aria-label', linkLabel\); link\.title = linkLabel/],
  ['Fold drawer exposes close affordance and supports Escape', /const syncToggle = \(expanded, \{ restoreFocus = false \} = \{\}\) => \{[\s\S]*?expanded \? 'Закрыть меню' : 'Открыть меню'[\s\S]*?iconMarkup\(expanded \? 'x' : 'menu-2'\)[\s\S]*?event\.key === 'Escape'[\s\S]*?syncToggle\(false, \{ restoreFocus: true \}\)/],
  ['Fold expanded navigation restores horizontal readable links', /\.portal-sidebar\.is-expanded \.portal-nav a\{display:flex;align-items:center;gap:12px;width:auto;height:auto;min-height:46px[\s\S]*?font-size:16px;line-height:1\.25\}/],
  ['Phone drawer keeps the page full-width and uses a dimmed overlay', /@media\(max-width:650px\)\{[\s\S]*?\.portal-app>\.portal-main\{[^}]*flex:1 1 100%;width:100%[\s\S]*?\.sidebar-backdrop:not\(\[hidden\]\)\{position:fixed;z-index:55;inset:0;display:block;background:rgba\(4,7,11,\.7\)/],
  ['Phone expanded navigation restores horizontal readable links', /@media\(max-width:650px\)\{[\s\S]*?\.portal-sidebar\.is-expanded \.portal-nav a\{display:flex;align-items:center;gap:12px[\s\S]*?font-size:16px;line-height:1\.25/],
  ['Compact-width drawer exposes controlled nav state, inert background, focus trap, backdrop and route close', /toggle\.setAttribute\('aria-controls', sidebar\.id\)[\s\S]*?const isDrawerViewport = \(\) => window\.matchMedia\('\(max-width: 900px\)'\)\.matches[\s\S]*?const modalOpen = expanded && isDrawerViewport\(\)[\s\S]*?main\.inert = modalOpen[\s\S]*?backdrop\.addEventListener\('click'[\s\S]*?event\.key !== 'Tab' \|\| !isDrawerViewport\(\)[\s\S]*?sidebar\.addEventListener\('click'[\s\S]*?portal-nav a/],
  ['Compact-width drawer closes when crossing the responsive breakpoint', /let drawerBreakpoint = isDrawerViewport\(\)[\s\S]*?window\.addEventListener\('resize',[\s\S]*?nextBreakpoint !== drawerBreakpoint[\s\S]*?syncToggle\(false, \{ restoreFocus: true \}\)/],
  ['Fold drawer, close control and backdrop have ordered layers and lock the workspace', /@media \(min-width:651px\) and \(max-width:900px\)\{[\s\S]*?\.sidebar-mobile-toggle\[aria-expanded="true"\]\{z-index:61\}[\s\S]*?\.portal-sidebar\.is-expanded\{position:fixed;z-index:60[\s\S]*?\.sidebar-backdrop:not\(\[hidden\]\)\{position:fixed;z-index:55[\s\S]*?\.portal\.sidebar-drawer-open\{overflow:hidden\}/],
  ['Smooth content transition', /\.velora-theme\s+#page-content\.crm-route-enter\s*\{\s*animation:\s*crm-route-content-in/],
  ['Reduced motion fallback', /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.velora-theme\s+#page-content\.crm-route-enter\s*\{\s*animation:none!important/],
  ['Fold/phone order journal uses labeled cards instead of crushed table columns', /@media\(max-width:760px\)\{[\s\S]*?\.orders-view \.table-wrap\{display:grid!important;grid-template-columns:minmax\(0,1fr\)[\s\S]*?\.orders-view \.orders-table\{display:contents!important[\s\S]*?\.orders-view \.orders-table tbody tr\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[\s\S]*?width:100%!important;min-width:0;justify-self:stretch;box-sizing:border-box[\s\S]*?\.orders-view \.orders-table tbody td::before\{content:attr\(data-label\)/],
  ['Order journal rows expose names for each compact card field', /rows\.querySelectorAll\(':scope > tr'\)\.forEach\(\(row\) => \{ if \(row\.querySelector\('\.empty'\)\) return; \['Заказ', 'Стол', 'Гость', 'Статус', 'Сумма', 'Создано', 'Действие'\]/],
  ['Stable scrollbar slot', /\.velora-theme\s+\.portal-main,\.staff-theme\s+main\s*\{\s*scrollbar-gutter:\s*stable;/]
];
for (const [name,re] of required) assert.match(name.startsWith('Icon-only') || name.startsWith('Fold drawer exposes') || name.startsWith('Phone drawer exposes') || name.startsWith('Phone drawer closes') || name.startsWith('Compact-width') || name.startsWith('Order journal rows') ? portal : css,re,name);
console.log(`FOLD RESPONSIVE CONTRACT: PASS (${required.length} invariants)`);

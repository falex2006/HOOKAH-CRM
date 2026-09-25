import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('style.css','utf8');
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
  ['Smooth content transition', /\.velora-theme\s+#page-content\.crm-route-enter\s*\{\s*animation:\s*crm-route-content-in/],
  ['Reduced motion fallback', /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.velora-theme\s+#page-content\.crm-route-enter\s*\{\s*animation:none!important/],
  ['Stable scrollbar slot', /\.velora-theme\s+\.portal-main,\.staff-theme\s+main\s*\{\s*scrollbar-gutter:\s*stable;/]
];
for (const [name,re] of required) assert.match(css,re,name);
console.log(`FOLD RESPONSIVE CONTRACT: PASS (${required.length} invariants)`);

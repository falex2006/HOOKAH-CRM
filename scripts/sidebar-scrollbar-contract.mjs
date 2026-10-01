import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const published = fs.readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
assert.equal(published, css, 'published CSS must preserve the exact local scrollbar contract');

// This is a source/cascade contract. Actual wheel and keyboard access to the last
// item, scrollWidth measurements and appearance require the browser QA report.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' '),
  declarations: match[2],
}));
const rule = (selector) => {
  const matches = rules.filter((item) => item.selector === selector);
  assert.ok(matches.length, `CSS rule is present: ${selector}`);
  return matches.map((item) => item.declarations.trim().replace(/;?$/, ';')).join('\n');
};
const has = (declarations, property, value, message) => {
  const values = [...declarations.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'g'))];
  assert.equal(values.at(-1)?.[1].trim(), value, message);
};

const frame = rule('.velora-theme .portal-sidebar,.staff-theme .portal-sidebar');
has(frame, 'overflow-y', 'auto', 'sidebar frame keeps wheel and keyboard scrolling');
has(frame, 'overflow-x', 'hidden', 'sidebar frame has no horizontal scroll surface');
has(frame, 'scrollbar-width', 'none', 'Firefox and current Chromium hide sidebar scrollbar chrome');
has(frame, 'overscroll-behavior', 'contain', 'sidebar wheel scrolling remains inside navigation');
const group = rule('.portal.velora-theme .portal-sidebar>.sidebar-nav-groups');
has(group, 'min-width', '0', 'navigation groups may shrink to their allocated sidebar width');
has(group, 'min-height', '0', 'navigation groups may shrink and become the vertical scroll owner');
has(group, 'overflow-y', 'auto', 'long expanded groups remain vertically reachable');
has(group, 'overflow-x', 'hidden', 'groups have no nested horizontal scroll surface');
has(group, 'scrollbar-width', 'none', 'groups do not draw a second vertical strip');
has(group, 'overscroll-behavior', 'contain', 'group scrolling does not move the page behind it');

for (const selector of [
  '.velora-theme .portal-sidebar::-webkit-scrollbar,.staff-theme .portal-sidebar::-webkit-scrollbar',
  '.portal.velora-theme .portal-sidebar>.sidebar-nav-groups::-webkit-scrollbar',
]) {
  const webkit = rule(selector);
  has(webkit, 'width', '0', `${selector}: no vertical scrollbar strip`);
  has(webkit, 'height', '0', `${selector}: no horizontal scrollbar strip`);
  has(webkit, 'display', 'none', `${selector}: old Chromium fallback remains explicit`);
}

// Prevent a future global/body/main fix from concealing the workspace scrollbar.
for (const item of rules.filter((item) => /scrollbar-width\s*:\s*none\b/.test(item.declarations))) {
  assert.ok(item.selector.split(',').every((selector) =>
    selector.includes('.portal-sidebar') && !/(?:^|\s)(?:html|body|main|:root)(?:\s|$)/.test(selector)),
  `hidden scrollbar styling stays scoped to sidebar containers: ${item.selector}`);
}
assert.match(css, /\.portal\.velora-theme \.portal-main\{[^}]*overflow-y:auto;[^}]*overflow-x:hidden/,
  'admin workspace retains its own scroll owner');
assert.match(css, /\.staff-theme main\{[^}]*overflow-y:auto;[^}]*overflow-x:hidden/,
  'employee workspace retains its own scroll owner');

console.log('SIDEBAR SCROLLBAR CONTRACT: PASS (scoped hidden chrome; vertical access retained; source/dist parity)');

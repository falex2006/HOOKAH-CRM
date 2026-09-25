import assert from 'node:assert/strict';
import fs from 'node:fs';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const tree = fs.readFileSync(new URL('../SITE_TREE.md', import.meta.url), 'utf8');

// A staff work contour is a real route variant, not a cosmetic label. The
// sidebar must preserve its query when deciding which item is active.
assert.match(portal, /const currentUrl = new URL\(location\.href\);/);
assert.match(portal, /const linkMode = linkUrl\.searchParams\.get\('mode'\);/);
assert.match(portal, /const currentMode = currentUrl\.searchParams\.get\('mode'\);/);
assert.match(portal, /const modeMatches = linkMode \? linkMode === currentMode : !linkMode;/);
assert.match(portal, /linkUrl\.pathname === currentPath && modeMatches && hashMatches/);
assert.match(portal, /href: '\/\?mode=staff'/);
assert.match(portal, /window\.addEventListener\('hashchange', \(\) => \{\s*normalizeManagementSidebar\(\);/s);

// Keep the canonical page tree aligned with the management sidebar's target
// pages, so adding a link cannot silently point at a non-canonical filename.
for (const route of ['/admin', '/orders', '/clients', '/reservations', '/inventory', '/finance']) {
  assert.ok(tree.includes(`| \`${route}\` |`), `tree missing ${route}`);
}
assert.match(portal, /href: '\/admin#settings'/);
assert.match(portal, /href: '\/integrations'/);

console.log('SIDEBAR NAVIGATION CONTRACT: PASS (canonical routes and mode-aware active state)');

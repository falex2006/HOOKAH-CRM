import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const siteMap = JSON.parse(readFileSync(new URL('../site-map.json', import.meta.url), 'utf8'));
const entries = siteMap.entries;
assert.ok(Array.isArray(entries) && entries.length >= 14, 'site map must declare all CRM pages');
for (const entry of entries) {
  assert.match(entry.file, /^[a-z][a-z-]*\.html$/, 'published template must be a root HTML file');
  assert.match(entry.path, /^\/(?:[a-z-]+(?:\/[a-z-]+)*)?$/, 'published route must be a safe absolute path');
}
assert.equal(new Set(entries.map(entry => entry.path)).size, entries.length, 'published paths must be unique');
export const publishedHtmlFiles = [...new Set(entries.map(entry => entry.file))];
export const routeAliases = Object.fromEntries(entries.filter(entry => entry.path !== '/')
  .map(entry => [`${entry.path.slice(1)}/index.html`, entry.file]));
// These are standalone design previews served by their own local helper.
export const localPreviewHtmlFiles = ['pos-demo.html'];
export const publishedHtmlPaths = [...publishedHtmlFiles, ...Object.keys(routeAliases)];

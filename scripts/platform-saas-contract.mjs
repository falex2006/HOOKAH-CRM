import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('../platform.html', import.meta.url), 'utf8');
const publishedHtml = readFileSync(new URL('../dist/platform.html', import.meta.url), 'utf8');
const publishedAlias = readFileSync(new URL('../dist/platform/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../platform.js', import.meta.url), 'utf8');
const publishedJs = readFileSync(new URL('../dist/platform.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const normalize = (value) => value.replace(/\r\n/g, '\n');
assert.equal(normalize(publishedHtml), normalize(html), 'published flat SaaS page must match the source');
assert.equal(normalize(publishedAlias), normalize(html), 'published /platform/ alias must match the source');
assert.equal(publishedJs, js, 'published SaaS behavior must match the source');
for (const id of ['companies', 'billing', 'health', 'settings']) assert.match(html, new RegExp(`id="${id}"`), `navigation target #${id} must exist`);
for (const id of ['open-company', 'platform-logout', 'company-search', 'organization-form', 'save-company-detail']) {
  assert.ok(html.includes(`id="${id}"`), `visible control ${id} must exist`);
}
for (const action of ["addEventListener('click'", "addEventListener('change'", "addEventListener('input'", "addEventListener('submit'", '/api/platform/overview', '/api/platform/organizations', '/api/platform/plans', '/api/health']) {
  assert.ok(js.includes(action), `platform action/data contract missing ${action}`);
}
assert.match(js, /escapeHtml/);
assert.match(js, /detailLoaded/);
assert.match(js, /dataset\.submitting/);
assert.match(js, /statusLabel/);
assert.doesNotMatch(js, /99\.9%/);
assert.doesNotMatch(html, /● Платформа работает|Control Center|гости Hookah POS/);
assert.match(html, /лимиты сотрудников и заведений проверяются при добавлении и реактивации/i);
const syncScript = readFileSync(new URL('../scripts/sync-published-assets.mjs', import.meta.url), 'utf8');
const platformRevision = Number(syncScript.match(/platformRevision = '(\d+)'/)?.[1]);
assert.ok(Number.isInteger(platformRevision) && platformRevision >= 5, 'SaaS navigation fix must advance the published cache key');
assert.match(html, new RegExp(`platform\\.js\\?rev=${platformRevision}`), 'SaaS bundle must use its exact current published cache key');
assert.doesNotMatch(html, /проверка ограничений при добавлении пользователей и заведений требует доработки/i);
assert.match(server, /platform_overview_unavailable/);
assert.match(server, /platform_organizations_unavailable/);
assert.match(server, /invalid_subscription_status/);
assert.match(server, /saas_account_unavailable/);
assert.match(server, /subscription_unavailable/);
assert.match(server, /use_subscription_endpoint/);
console.log('PLATFORM SAAS CONTRACT: PASS (controls, API links, truthful states, role/data contracts, published assets)');

import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:3000';
if (!['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname)) throw new Error('Local-only platform organization contract refused');

const listResponse = await fetch(`${base}/api/platform/organizations`);
const list = await listResponse.json();
assert.equal(listResponse.status, 200, JSON.stringify(list));
assert.ok(list.items?.length, 'platform organization list is empty');
const organization = list.items[0];

const invalidResponse = await fetch(`${base}/api/platform/organizations/${organization.id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'not-a-plan' })
});
const invalid = await invalidResponse.json();
assert.equal(invalidResponse.status, 400, JSON.stringify(invalid));
assert.equal(invalid.error, 'invalid_plan');

const patchResponse = await fetch(`${base}/api/platform/organizations/${organization.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: organization.name, isActive: organization.isActive !== false })
});
const patched = await patchResponse.json();
assert.equal(patchResponse.status, 200, JSON.stringify(patched));
assert.equal(patched.id, organization.id);
assert.equal(patched.name, organization.name);
assert.equal(patched.isActive, organization.isActive !== false);

console.log(`LOCAL PLATFORM ORGANIZATION CONTRACT: PASS (org=${organization.id}, validation and atomic patch)`);

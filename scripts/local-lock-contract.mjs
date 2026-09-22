import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:3000';
if (!['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname)) throw new Error('Local-only lock contract refused');

const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'staff', pin: '1234' }) });
const session = await login.json();
assert.equal(login.status, 200, JSON.stringify(session));
assert.equal(session.user.pinConfigured, true);
const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
const invalid = await fetch(`${base}/api/session/unlock`, { method: 'POST', headers, body: JSON.stringify({ pin: '0000' }) });
assert.equal(invalid.status, 401);
const valid = await fetch(`${base}/api/session/unlock`, { method: 'POST', headers, body: JSON.stringify({ pin: '1234' }) });
const validPayload = await valid.json();
assert.equal(valid.status, 200, JSON.stringify(validPayload));
assert.equal(validPayload.ok, true);
const ownerLogin = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'demo' }) });
const owner = await ownerLogin.json();
assert.equal(ownerLogin.status, 200, JSON.stringify(owner));
const ownerUnlock = await fetch(`${base}/api/session/unlock`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1234' }) });
assert.equal(ownerUnlock.status, 409);
console.log('LOCAL LOCK CONTRACT: PASS (invalid PIN rejected, valid PIN unlocks, unconfigured PIN is blocked)');

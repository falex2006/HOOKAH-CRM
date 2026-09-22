import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:3000';
if (!['localhost', '127.0.0.1', '::1'].includes(new URL(base).hostname)) throw new Error('Local-only preferences contract refused');
const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'staff', pin: '1234' }) });
const session = await login.json(); assert.equal(login.status, 200, JSON.stringify(session));
const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
const invalid = await fetch(`${base}/api/session/preferences`, { method: 'PATCH', headers, body: JSON.stringify({ lockTimeoutMinutes: 2 }) });
assert.equal(invalid.status, 400);
const saved = await fetch(`${base}/api/session/preferences`, { method: 'PATCH', headers, body: JSON.stringify({ lockTimeoutMinutes: 15 }) });
const savedPayload = await saved.json(); assert.equal(saved.status, 200, JSON.stringify(savedPayload)); assert.equal(savedPayload.preferences.lockTimeoutMinutes, 15);
const read = await fetch(`${base}/api/session/preferences`, { headers }); const readPayload = await read.json();
assert.equal(read.status, 200); assert.equal(readPayload.preferences.lockTimeoutMinutes, 15);
console.log('LOCAL PREFERENCES CONTRACT: PASS (per-user lock timeout validates, saves and reads)');

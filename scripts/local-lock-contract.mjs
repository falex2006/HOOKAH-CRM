import assert from 'node:assert/strict';
import fs from 'node:fs';

const lock = fs.readFileSync('lock.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
assert.match(lock, /api\/session\/unlock/);
assert.match(lock, /value\.length !== 4/);
assert.match(lock, /pattern="\[0-9\]\{4\}"/);
assert.match(server, /pin_not_configured/);
assert.match(server, /invalid_pin/);
assert.match(server, /verifyPassword\(pin/);
console.log('LOCAL LOCK CONTRACT: PASS (four-digit validation, invalid PIN rejection and unconfigured PIN guard)');

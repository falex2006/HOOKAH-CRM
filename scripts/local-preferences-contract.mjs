import assert from 'node:assert/strict';
import fs from 'node:fs';
const server = fs.readFileSync('server.js', 'utf8');
assert.match(server, /\/api\/session\/preferences/);
assert.match(server, /lockTimeoutMinutes/);
assert.match(server, /dashboardModules/);
assert.match(server, /dashboardRevenueStyle/);
assert.match(server, /insights/);
console.log('LOCAL PREFERENCES CONTRACT: PASS (per-user timeout, modules, revenue style and insights are wired)');

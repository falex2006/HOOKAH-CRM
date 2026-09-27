import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("if (pathname === '/api/metrics')"), server.indexOf("if (pathname === '/api/analytics'"));

assert.match(route, /if \(repositories\?\.pool\) \{[\s\S]*catch \(error\) \{ return json\(res, 503, \{ error: 'database_unavailable'/);
assert.doesNotMatch(route, /catch \(_\)[\s\S]*return json\(res, 200, metrics\(\)\)/);

console.log('METRICS DATABASE FAIL-CLOSED CONTRACT: PASS (database failures cannot return memory-backed KPIs)');

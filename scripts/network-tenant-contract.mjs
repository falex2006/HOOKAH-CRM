import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const networkStart = server.indexOf("if (pathname === '/api/network/venues' && req.method === 'GET')");
const networkEnd = server.indexOf("if (pathname === '/api/finance/categories'", networkStart);
assert(networkStart >= 0 && networkEnd > networkStart, 'network venue API block must remain discoverable');
const block = server.slice(networkStart, networkEnd);

assert.match(server, /const requestOrganizationId = \(req\) => String\(req\.user\?\.organizationId \|\| ''\)\.trim\(\);/);
assert.match(server, /const requireOrganizationContext = \(req, res\) =>/);
assert.match(block, /FROM venues WHERE is_active=true AND organization_id=\$1 ORDER BY name/);
assert.match(block, /query\([^;]*organization_id=\$1 ORDER BY name', \[organizationId\]\)/s);
assert.match(block, /INSERT INTO venues \(organization_id,name,format,city,address,phone,timezone,is_current\)/);
assert.match(block, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,false\)/);
assert.match(block, /values\.push\(organizationId\);/);
assert.match(block, /WHERE id=\$1 AND organization_id=\$\$\{values\.length\} AND is_active=true/);
assert.match(block, /UPDATE venues SET is_active=false WHERE id=\$1 AND organization_id=\$2 AND is_active=true/);
assert.match(block, /FROM venues WHERE id=\$1 AND organization_id=\$2 AND is_active=true FOR UPDATE/);
assert.match(block, /UPDATE venues SET is_current=false WHERE is_active=true AND organization_id=\$1', \[requestOrganizationId\(req\)\]/);
assert.match(block, /UPDATE venues SET is_current=true WHERE id=\$1 AND organization_id=\$2/);

const pooledNetworkRoutes = block.split('if (repositories?.pool').length - 1;
const guardedPooledRoutes = [...block.matchAll(/if \(requireOrganizationContext\(req, res\)\) return;/g)].length;
assert.equal(guardedPooledRoutes, pooledNetworkRoutes, 'every database-backed network route must require organization context');

console.log('NETWORK TENANT CONTRACT: PASS (network venue API is organization-scoped)');

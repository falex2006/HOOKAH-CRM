import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const helper = serverSource.slice(serverSource.indexOf('const resolveIanaTimezone'), serverSource.indexOf('const recentBusinessDates'));
assert.match(helper, /resolveIanaTimezone\(rows\[0\]\.venueTimezone, rows\[0\]\.organizationTimezone\)/,
  'corrupt legacy venue timezone must fall back to a valid organization timezone');
assert.match(helper, /\|\| 'Asia\/Yekaterinburg'/,
  'corrupt legacy venue and organization timezones must fall back to the established default');
assert.match(helper, /SELECT v\.timezone AS "venueTimezone", org\.timezone AS "organizationTimezone"/,
  'database context must fetch candidates before applying IANA validation');

const routeCases = [
  ["if (pathname === '/api/setup/owner'", "if (pathname === '/api/login'", /isValidIanaTimezone\(timezone\)/, 'first-run venue setup'],
  ["if (pathname === '/api/platform/organizations' && req.method === 'POST'", "const platformOrgSubscription", /isValidIanaTimezone\(timezone\)/, 'organization and initial-venue creation'],
  ["if (pathname === '/api/venue' && \(req.method === 'PATCH'", "if (pathname\.startsWith\('/api/integrations/'", /isValidIanaTimezone\(input\.timezone\)/, 'current venue settings'],
  ["if (pathname === '/api/network/venues' && req.method === 'POST'", "const networkVenuePath", /isValidIanaTimezone\(timezone\)/, 'network venue creation'],
  ["const networkVenuePath = pathname.match", "if (networkVenuePath && req.method === 'DELETE')", /isValidIanaTimezone\(input\.timezone\)/, 'network venue update'],
];
for (const [startMarker, endMarker, guard, label] of routeCases) {
  const start = serverSource.indexOf(startMarker);
  const end = serverSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${label} route exists`);
  assert.match(serverSource.slice(start, end), guard, `${label} rejects unsupported timezone identifiers`);
}

const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: '', AUTH_REQUIRED: 'false', FIRST_RUN_SETUP_ENABLED: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
const baseUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { child.kill(); reject(new Error(`isolated timezone QA server did not start: ${output}`)); }, 15_000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`isolated timezone QA server exited (${code}): ${output}`)); });
  child.stdout.on('data', chunk => {
    const match = String(chunk).match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
});

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};
const patch = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};

try {
  const setupPayload = { venueName: 'TZ QA', ownerName: 'TZ QA Owner', ownerLogin: 'tz-qa@example.test', ownerPassword: 'test-password-123', city: 'Тест', timezone: 'Mars/Olympus' };
  const badSetup = await post('/api/setup/owner', setupPayload);
  assert.equal(badSetup.status, 400, 'first-run setup rejects invalid timezone before checking unavailable database');
  assert.equal((await post('/api/setup/owner', { ...setupPayload, timezone: 'Europe/Moscow' })).status, 503, 'first-run setup accepts a valid timezone then reports that this test runtime has no database');

  const organizationPayload = { name: 'TZ QA Org', slug: 'tz-qa-org', ownerName: 'TZ QA Owner', ownerLogin: 'tz-qa-org@example.test', ownerPassword: 'test-password-123' };
  const invalidOrganization = await post('/api/platform/organizations', { ...organizationPayload, timezone: 'Mars/Olympus' });
  assert.equal(invalidOrganization.status, 400, 'organization creation rejects invalid timezone');
  assert.equal((await post('/api/platform/organizations', { ...organizationPayload, timezone: 'Europe/Moscow' })).status, 201, 'organization creation accepts a valid timezone');

  const invalidVenueSettings = await patch('/api/venue', { timezone: 'Mars/Olympus' });
  assert.equal(invalidVenueSettings.status, 400, 'venue settings reject invalid timezone');
  const validVenueSettings = await patch('/api/venue', { timezone: 'Europe/Moscow' });
  assert.equal(validVenueSettings.status, 200, 'venue settings accept a valid IANA timezone');
  assert.equal(validVenueSettings.data.timezone, 'Europe/Moscow');

  const baseVenue = { name: 'TZ QA Branch', city: 'Тест', address: 'Тестовая улица' };
  const invalidNetworkCreate = await post('/api/network/venues', { ...baseVenue, timezone: 'Mars/Olympus' });
  assert.equal(invalidNetworkCreate.status, 400, 'network venue creation rejects invalid timezone');
  const validNetworkCreate = await post('/api/network/venues', { ...baseVenue, name: 'TZ QA Valid Branch', timezone: 'Asia/Vladivostok' });
  assert.equal(validNetworkCreate.status, 201, 'network venue creation accepts a valid IANA timezone');
  assert.equal(validNetworkCreate.data.timezone, 'Asia/Vladivostok');

  const invalidNetworkUpdate = await patch(`/api/network/venues/${encodeURIComponent(validNetworkCreate.data.id)}`, { timezone: 'Mars/Olympus' });
  assert.equal(invalidNetworkUpdate.status, 400, 'network venue update rejects invalid timezone');
  const validNetworkUpdate = await patch(`/api/network/venues/${encodeURIComponent(validNetworkCreate.data.id)}`, { timezone: 'Europe/Moscow' });
  assert.equal(validNetworkUpdate.status, 200, 'network venue update accepts valid IANA timezone');
  assert.equal(validNetworkUpdate.data.timezone, 'Europe/Moscow');

  console.log('VENUE TIMEZONE VALIDATION QA: PASS (all five write paths, invalid/valid IANA values, corrupted legacy-zone fallback contract)');
} finally {
  child.kill();
  await once(child, 'exit').catch(() => {});
}

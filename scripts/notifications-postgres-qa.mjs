import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.NOTIFICATIONS_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set NOTIFICATIONS_TEST_DATABASE_URL to a disposable PostgreSQL QA database');
const { Client } = createRequire(import.meta.url)('pg');
const database = new Client({ connectionString: databaseUrl });
await database.connect();
const { rows: databaseRows } = await database.query('SELECT current_database() AS name');
if (!/^notifications_qa(?:_|$)/i.test(databaseRows[0].name)) {
  await database.end();
  throw new Error(`Refusing to run outside a disposable notifications_qa database (got ${databaseRows[0].name})`);
}

const reservePort = async () => {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const { port } = server.address(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); return port;
};
const port = await reservePort(); const baseUrl = `http://127.0.0.1:${port}`;
const suffix = randomUUID().slice(0, 8);
const organizationId = randomUUID(); const venueA = randomUUID(); const venueB = randomUUID();
const ownerId = randomUUID(); const adminId = randomUUID(); const secondVenueUserId = randomUUID();
const eventA = randomUUID(); const eventB = randomUUID();
const ownerLogin = `notify_owner_${suffix}`; const adminLogin = `notify_admin_${suffix}`; const secondVenueLogin = `notify_venueb_${suffix}`;
const serverScript = fileURLToPath(new URL('../server.js', import.meta.url));
let child; let serverOutput = '';

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
};
const startServer = async () => {
  child = spawn(process.execPath, [serverScript], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: databaseUrl, AUTH_REQUIRED: 'true', VENUE_ID: venueA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CRM startup timed out: ${serverOutput}`)), 15_000);
    const ready = (chunk) => { if (String(chunk).includes('CRM running on')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } };
    child.stdout.on('data', ready); child.once('error', reject); child.once('exit', (code) => reject(new Error(`CRM exited (${code}): ${serverOutput}`)));
  });
};
const stopServer = async () => {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM'); await once(child, 'exit'); child = null;
};
const login = async (username) => {
  const result = await request('/api/login', { method: 'POST', body: { username, password: 'demo' } });
  assert.equal(result.status, 200, `${username} login: ${JSON.stringify(result.payload)}`);
  return result.payload.token;
};

try {
  await database.query(`INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Notifications PG QA',$2,'network')`, [organizationId, `notifications-qa-${suffix}`]);
  await database.query(`INSERT INTO organization_subscriptions(organization_id,plan,status,seats_limit,venues_limit) VALUES($1,'network','active',30,10)`, [organizationId]);
  await database.query(`INSERT INTO venues(id,organization_id,name,city,address) VALUES($1,$3,'QA venue A','Tyumen','QA address A'),($2,$3,'QA venue B','Tyumen','QA address B')`, [venueA, venueB, organizationId]);
  await database.query(`INSERT INTO users(id,venue_id,organization_id,full_name,login,password_hash,role,permission_scopes) VALUES
    ($1,$4,$5,'QA Owner',$6,'demo','owner','[]'::jsonb),
    ($2,$4,$5,'QA Orders Admin',$7,'demo','admin','["orders"]'::jsonb),
    ($3,$8,$5,'QA Venue B Owner',$9,'demo','owner','[]'::jsonb)`, [ownerId, adminId, secondVenueUserId, venueA, organizationId, ownerLogin, adminLogin, venueB, secondVenueLogin]);
  await database.query(`INSERT INTO organization_memberships(organization_id,user_id,membership_role,status) VALUES($1,$2,'owner','active'),($1,$3,'admin','active'),($1,$4,'owner','active')`, [organizationId, ownerId, adminId, secondVenueUserId]);
  await database.query(`INSERT INTO audit_events(id,venue_id,actor_id,action,entity_type,entity_id,after_data,created_at) VALUES
    ($1,$3,$4,'order.deleted','order',$5,'{}'::jsonb,now()),
    ($2,$6,$4,'order.deleted','order',$7,'{}'::jsonb,now()-interval '1 minute')`, [eventA, eventB, venueA, ownerId, randomUUID(), venueB, randomUUID()]);
  await startServer();

  const owner = await login(ownerLogin); const admin = await login(adminLogin); const venueBUser = await login(secondVenueLogin);
  const ownerFeed = await request('/api/notifications?venueId=' + venueB, { token: owner });
  assert.equal(ownerFeed.status, 200); assert.deepEqual(ownerFeed.payload.items.map((item) => item.id), [`order_deleted:${eventA}`], 'PG source query derives venue from authenticated active session');
  const adminFeed = await request('/api/notifications', { token: admin });
  assert.equal(adminFeed.payload.items[0].id, `order_deleted:${eventA}`);
  const adminRead = await request(`/api/notifications/${encodeURIComponent(`order_deleted:${eventA}`)}/read`, { method: 'PUT', token: admin, body: { userId: ownerId, venueId: venueB } });
  assert.equal(adminRead.status, 200);
  assert.equal((await request('/api/notifications', { token: owner })).payload.items[0].readAt, null, 'PG receipt write is bound to authenticated user, not body userId');
  assert.equal((await request(`/api/notifications/${encodeURIComponent(`order_deleted:${eventA}`)}/read`, { method: 'PUT', token: venueBUser })).status, 404, 'user homed in venue B cannot mark venue A event read');

  const selectedVenue = await request(`/api/network/venues/${venueB}/select`, { method: 'POST', token: owner });
  assert.equal(selectedVenue.status, 200, 'owner can switch active session venue within organization');
  const venueBFeed = await request(`/api/notifications?venueId=${venueA}`, { token: owner });
  assert.equal(venueBFeed.status, 200); assert.deepEqual(venueBFeed.payload.items.map((item) => item.id), [`order_deleted:${eventB}`], 'same user sees only selected venue source, ignoring query override');
  assert.equal((await request(`/api/notifications/${encodeURIComponent(`order_deleted:${eventA}`)}/read`, { method: 'PUT', token: owner })).status, 404, 'switched session cannot mark prior venue event read');
  const ownerReadB = await request('/api/notifications', { method: 'POST', token: owner, body: { userId: adminId, venueId: venueA } });
  assert.equal(ownerReadB.status, 200);
  assert.ok((await request('/api/notifications', { token: owner })).payload.items[0].readAt, 'read-all writes receipt for active venue and authenticated user');

  const selectedVenueA = await request(`/api/network/venues/${venueA}/select`, { method: 'POST', token: owner });
  assert.equal(selectedVenueA.status, 200);
  assert.equal((await request('/api/notifications', { token: owner })).payload.items[0].readAt, null, 'read-all in venue B does not mark venue A receipt');
  const markOwnerRead = await request(`/api/notifications/${encodeURIComponent(`order_deleted:${eventA}`)}/read`, { method: 'PUT', token: owner });
  assert.equal(markOwnerRead.status, 200);

  await stopServer();
  await startServer();
  const persistedAfterRestart = await request('/api/notifications', { token: owner });
  assert.equal(persistedAfterRestart.status, 200);
  assert.ok(persistedAfterRestart.payload.items.find((item) => item.id === `order_deleted:${eventA}`)?.readAt, 'PostgreSQL read state survives application process restart');

  await database.query('DROP TABLE inventory_auto_orders CASCADE');
  const sourceFailure = await request('/api/notifications', { token: owner });
  assert.equal(sourceFailure.status, 503, 'failure of a PostgreSQL notification source is not returned as an empty feed');
  console.log('NOTIFICATIONS POSTGRES QA: session venue/user scoping, direct foreign-ID denial, orders-scoped admin, per-user/per-venue receipts, read-all, restart persistence, and source-query 503 passed');
} finally {
  await stopServer();
  await database.end();
}

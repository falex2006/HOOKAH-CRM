import assert from 'node:assert/strict';
import pg from 'pg';
import { assertQaDatabaseIdentity, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3219';
const target = new URL(base);
assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname), 'SaaS PostgreSQL QA only runs against a local app');
const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set MIGRATIONS_PG_TEST_DATABASE_URL to an isolated local PostgreSQL test database');
const databaseTarget = validateQaDatabaseUrl(databaseUrl, 'MIGRATIONS_PG_TEST_DATABASE_URL');
const client = new pg.Client({ connectionString: databaseUrl });
const request = async (path, options) => {
  const response = await fetch(new URL(path, target), options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};
const jsonHeaders = (token) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const send = async (path, token, data, method = 'POST') => request(path, { method, headers: jsonHeaders(token), body: JSON.stringify(data) });
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
let organizationId = null;
let ownerLogin = null;

try {
  await client.connect();
  const identity = await client.query(`SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false) AS superuser`);
  assertQaDatabaseIdentity(identity.rows[0], databaseTarget.database, Number(databaseTarget.url.port || 5432), 'SaaS quota PostgreSQL QA target');

  const platformLogin = await send('/api/login', null, {
    username: process.env.SAAS_OWNER_EMAIL || 'platform-owner@example.com',
    password: process.env.SAAS_OWNER_PASSWORD || 'qa-platform-password',
  });
  assert.equal(platformLogin.response.status, 200, 'platform owner can sign in');
  const platformToken = platformLogin.payload.token;
  const platformHeaders = jsonHeaders(platformToken);

  ownerLogin = `saas-qa-${suffix}@example.test`;
  const created = await send('/api/platform/organizations', platformToken, {
    name: `SaaS QA ${suffix}`, slug: `saas-qa-${suffix}`.slice(0, 49), city: 'Тюмень', address: 'QA',
    ownerName: 'QA Tenant Owner', ownerLogin, ownerPassword: `Qa-${suffix}-Pass!`, plan: 'starter',
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.payload));
  organizationId = created.payload.id;

  const ownerLoginResponse = await send('/api/login', null, { username: ownerLogin, password: `Qa-${suffix}-Pass!` });
  assert.equal(ownerLoginResponse.response.status, 200, 'new tenant owner can sign in');
  const ownerToken = ownerLoginResponse.payload.token;
  const makeStaff = (index) => ({
    name: `QA Member ${index}`, role: 'bartender', password: '1234', birthDate: '1990-01-01',
    employmentStartedAt: '2024-01-01', login: `saasqa${suffix.replace(/-/g, '')}${index}`,
  });

  for (let index = 0; index < 4; index += 1) {
    const added = await send('/api/staff', ownerToken, makeStaff(index));
    assert.equal(added.response.status, 201, `seat ${index + 2} is within Starter limit`);
  }
  const overSeatLimit = await send('/api/staff', ownerToken, makeStaff(9));
  assert.equal(overSeatLimit.response.status, 409);
  assert.equal(overSeatLimit.payload.error, 'seat_limit_reached');

  const membership = await client.query(`SELECT u.organization_id AS "organizationId",m.status
    FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=u.organization_id
    WHERE u.login=$1`, [makeStaff(0).login]);
  assert.equal(membership.rows[0]?.organizationId, organizationId, 'created staff inherits verified tenant context');
  assert.equal(membership.rows[0]?.status, 'active', 'created staff receives active tenant membership');

  const overVenueLimit = await send('/api/network/venues', ownerToken, { name: 'Extra venue', city: 'Тюмень', address: 'QA' });
  assert.equal(overVenueLimit.response.status, 409);
  assert.equal(overVenueLimit.payload.error, 'venue_limit_reached');

  await client.query(`UPDATE organization_subscriptions SET plan='growth',seats_limit=15,venues_limit=3 WHERE organization_id=$1`, [organizationId]);
  const createVenue = (index) => send('/api/network/venues', ownerToken, { name: `Extra ${index}`, city: 'Тюмень', address: `QA ${index}` });
  const concurrentVenues = await Promise.all([createVenue(1), createVenue(2), createVenue(3)]);
  assert.equal(concurrentVenues.filter(({ response }) => response.status === 201).length, 2, 'only two remaining Growth venue slots are created');
  assert.equal(concurrentVenues.filter(({ response, payload }) => response.status === 409 && payload.error === 'venue_limit_reached').length, 1, 'concurrent overflow is rejected');

  await client.query(`UPDATE organization_subscriptions SET plan='starter',seats_limit=4,venues_limit=1 WHERE organization_id=$1`, [organizationId]);
  const firstStaffId = membership.rows[0] && (await client.query('SELECT id FROM users WHERE login=$1', [makeStaff(0).login])).rows[0].id;
  await client.query('UPDATE users SET is_active=false WHERE id=$1', [firstStaffId]);
  const reactivation = await send(`/api/staff/${firstStaffId}/status`, ownerToken, { active: true }, 'PATCH');
  assert.equal(reactivation.response.status, 409, 'reactivation is blocked when downgraded plan is already at capacity');
  assert.equal(reactivation.payload.error, 'seat_limit_reached');

  await client.query(`UPDATE organization_subscriptions SET status='cancelled' WHERE organization_id=$1`, [organizationId]);
  const suspendedExistingSession = await request('/api/session', { headers: jsonHeaders(ownerToken) });
  assert.ok([401, 403].includes(suspendedExistingSession.response.status), 'an existing tenant session is blocked after cancellation');
  const suspendedNewLogin = await send('/api/login', null, { username: ownerLogin, password: `Qa-${suffix}-Pass!` });
  assert.equal(suspendedNewLogin.response.status, 403, 'new tenant login is blocked after cancellation');
  const platformStillWorks = await request('/api/platform/organizations', { headers: platformHeaders });
  assert.equal(platformStillWorks.response.status, 200, 'platform owner can manage a suspended tenant');

  await client.query(`UPDATE organization_subscriptions SET status='active' WHERE organization_id=$1`, [organizationId]);
  const resumedLogin = await send('/api/login', null, { username: ownerLogin, password: `Qa-${suffix}-Pass!` });
  assert.equal(resumedLogin.response.status, 200, 'tenant can sign in after subscription is resumed');
  console.log('SAAS QUOTA/SUSPENSION POSTGRES QA: PASS (seat and venue caps, race, membership, reactivation, suspend and resume)');
} finally {
  if (organizationId) {
    await client.query('BEGIN').catch(() => {});
    await client.query(`DELETE FROM audit_events WHERE venue_id IN (SELECT id FROM venues WHERE organization_id=$1)`, [organizationId]).catch(() => {});
    await client.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id=$1)', [organizationId]).catch(() => {});
    await client.query('DELETE FROM users WHERE organization_id=$1', [organizationId]).catch(() => {});
    await client.query('DELETE FROM venues WHERE organization_id=$1', [organizationId]).catch(() => {});
    await client.query('DELETE FROM organizations WHERE id=$1', [organizationId]).catch(() => {});
    await client.query('COMMIT').catch(() => client.query('ROLLBACK').catch(() => {}));
  }
  if (client._connected) await client.end();
}

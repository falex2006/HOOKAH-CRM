import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validateQaDatabaseUrl } from './postgres-qa-safety.mjs';
import { randomUUID, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const databaseUrl = process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
validateQaDatabaseUrl(databaseUrl);
const qaUserId = randomUUID();
const legacyCredentialUserId = randomUUID();
const organizationId = randomUUID();
const venueId = randomUUID();
const qaLogin = 'qa-settings-admin-' + qaUserId;
const legacyLogin = 'qa-legacy-credential-' + legacyCredentialUserId;
const password = 'qa-' + randomUUID();
const salt = randomBytes(16).toString('hex');
const hash = 'scrypt$' + salt + '$' + (await promisify(scryptCallback)(password, salt, 64)).toString('hex');
const qaPool = new pg.Pool({ connectionString: databaseUrl });
await qaPool.query('BEGIN');
try {
  await qaPool.query("INSERT INTO organizations (id,name,slug,plan) VALUES ($1,'Session preferences QA',$2,'network')", [organizationId, 'session-preferences-qa-' + organizationId]);
  await qaPool.query("INSERT INTO organization_subscriptions (organization_id,plan,status,seats_limit,venues_limit) VALUES ($1,'network','active',30,10)", [organizationId]);
  await qaPool.query("INSERT INTO venues (id,organization_id,name) VALUES ($1,$2,'Session preferences QA')", [venueId, organizationId]);
  await qaPool.query("INSERT INTO users (id,venue_id,organization_id,full_name,login,password_hash,role) VALUES ($1,$2,$3,'Session preferences QA',$4,$5,'admin')", [qaUserId, venueId, organizationId, qaLogin, hash]);
  await qaPool.query("INSERT INTO organization_memberships (organization_id,user_id,membership_role,status) VALUES ($1,$2,'admin','active')", [organizationId, qaUserId]);
  await qaPool.query('COMMIT');
} catch(error) { await qaPool.query('ROLLBACK'); await qaPool.end(); throw error; }
const original = await qaPool.query('SELECT preferences,organization_id,venue_id FROM users WHERE id=$1 AND login=$2', [qaUserId, qaLogin]);
assert.equal(original.rowCount, 1, 'dedicated QA user is required');
const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: databaseUrl, AUTH_REQUIRED: 'true', DEMO_MODE: 'false', NODE_ENV: 'test', DEMO_ADMIN_PASSWORD: 'qa-demo-alias-only', VENUE_ID: venueId },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let legacyFixtureCreated = false;
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Preferences PostgreSQL QA server did not start: ${output}`)), 15000);
    child.once('error', reject);
    child.stdout.on('data', () => {
      const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  const demoAlias = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'qa-demo-alias-only' }) });
  assert.equal(demoAlias.status, 401, 'demo credential cannot adopt a PostgreSQL user');
  await qaPool.query('INSERT INTO users (id,venue_id,organization_id,full_name,login,password_hash,pin_hash,role) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)', [legacyCredentialUserId, original.rows[0].venue_id, original.rows[0].organization_id, 'QA Legacy Credential', legacyLogin, 'qa1234', 'bartender']);
  legacyFixtureCreated = true;
  const legacyCredential = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: legacyLogin, password: 'qa1234' }) });
  assert.equal(legacyCredential.status, 401, 'a non-password credential cannot authenticate the DB login');
  const login = async () => {
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: qaLogin, password }) });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.user.id, qaUserId, 'login must keep the exact DB identity');
    assert.equal(data.user.role, 'admin');
    return data.token;
  };
  const first = await login();
  const second = await login();
  const api = async (token, method = 'GET', body) => {
    const response = await fetch(`${base}/api/session/preferences`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data.preferences;
  };
  await Promise.all([
    api(first, 'PATCH', { theme: 'light', dashboardModules: { quick: false } }),
    api(second, 'PATCH', { financeMetrics: { median: false }, dashboardModules: { staff: false } }),
  ]);
  for (const token of [first, second]) {
    const preferences = await api(token);
    assert.equal(preferences.theme, 'light');
    assert.equal(preferences.dashboardModules.quick, false);
    assert.equal(preferences.dashboardModules.staff, false);
    assert.equal(preferences.financeMetrics.median, false);
  }
  await qaPool.query(`CREATE OR REPLACE FUNCTION qa_reject_auth_session_42() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${qaUserId}'::uuid THEN RAISE EXCEPTION 'qa session insert failure'; END IF; RETURN NEW; END $$`);
  await qaPool.query('CREATE TRIGGER qa_reject_auth_session_42 BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION qa_reject_auth_session_42()');
  const failedSession = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'crm_device_id=qa-failed-session' }, body: JSON.stringify({ username: qaLogin, password }) });
  assert.equal(failedSession.status, 503, 'session persistence failure must fail login');
  assert.equal((await failedSession.json()).error, 'session_unavailable');
  assert.equal(failedSession.headers.get('set-cookie'), null, 'failed login cannot issue a session cookie');
  console.log('PASS PostgreSQL login authority, session failure handling and preference merge');
} finally {
  child.kill();
  await qaPool.query('DROP TRIGGER IF EXISTS qa_reject_auth_session_42 ON auth_sessions');
  await qaPool.query('DROP FUNCTION IF EXISTS qa_reject_auth_session_42()');
  await qaPool.query('UPDATE users SET preferences=$1::jsonb WHERE id=$2 AND login=$3', [JSON.stringify(original.rows[0].preferences || {}), qaUserId, qaLogin]);
  await qaPool.query('DELETE FROM auth_sessions WHERE user_id=$1', [qaUserId]);
  if (legacyFixtureCreated) await qaPool.query('DELETE FROM users WHERE id=$1 AND login=$2', [legacyCredentialUserId, legacyLogin]);
  await qaPool.query('DELETE FROM users WHERE id=$1 AND login=$2', [qaUserId, qaLogin]);
  await qaPool.query('DELETE FROM venues WHERE id=$1', [venueId]);
  await qaPool.query('DELETE FROM organizations WHERE id=$1', [organizationId]);
  await qaPool.end();
}

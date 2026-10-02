import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { validateQaDatabaseUrl, assertQaDatabaseIdentity } from './postgres-qa-safety.mjs';

// The fixture uses only an explicitly supplied, verified disposable loopback DB.
// Never inherit DATABASE_URL or exercise an existing employee's credentials.
const target = validateQaDatabaseUrl(process.env.MIGRATIONS_PG_TEST_DATABASE_URL, 'Staff login race QA');
const pool = new pg.Pool({ connectionString: target.url.href, max: 3, connectionTimeoutMillis: 5000 });
const require = createRequire(import.meta.url);
const { createRepositories } = require('../db.js');
const repositories = createRepositories(target.url.href);
assert.ok(repositories?.sessions, 'Session repository is available');
const marker = 'qa_staff_login_race_' + randomUUID().replaceAll('-', '');
repositories.pool.options.application_name = marker;
repositories.pool.options.options = '-c statement_timeout=10000 -c lock_timeout=7000';
const org = randomUUID(), venue = randomUUID(), user = randomUUID();
const oldLogin = 'QaOld_' + randomUUID().slice(0, 8), newLogin = 'QaNew_' + randomUUID().slice(0, 8);
let touched = false, renameClient = null, pending = null, checks = 0;
const check = (value, label) => { checks++; assert.ok(value, label); };
const equal = (actual, expected, label) => { checks++; assert.deepEqual(actual, expected, label); };
const input = expectedLogin => ({ userId: user, expectedLogin, deviceId: randomUUID(),
  tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
  expiresAt: new Date(Date.now() + 3600000).toISOString(), activeVenueId: venue });
const sessionCount = async () => Number((await pool.query('SELECT count(*) AS count FROM auth_sessions WHERE user_id=$1', [user])).rows[0].count);
const credentials = async () => (await pool.query('SELECT password_hash,pin_hash FROM users WHERE id=$1', [user])).rows[0];
const waitForUserLock = async blocker => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const waiting = await pool.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))", [marker, blocker]);
    if (waiting.rowCount) return true;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return false;
};

try {
  const identity = (await pool.query('SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,rolsuper AS superuser FROM pg_roles WHERE rolname=current_user')).rows[0];
  assertQaDatabaseIdentity(identity, target.database, Number(target.url.port || 5432), 'Staff login race QA');
  touched = true;
  await pool.query("INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Synthetic staff login race QA',$2,'enterprise')", [org, marker]);
  await pool.query("INSERT INTO organization_subscriptions(organization_id,plan,status,seats_limit,venues_limit) VALUES($1,'enterprise','active',10,2)", [org]);
  await pool.query("INSERT INTO venues(id,organization_id,name) VALUES($1,$2,'Synthetic staff login race QA')", [venue, org]);
  await pool.query("INSERT INTO users(id,venue_id,organization_id,full_name,login,password_hash,pin_hash,role) VALUES($1,$2,$3,'Synthetic login race worker',$4,'synthetic-unused-hash','synthetic-unused-pin','bartender')", [user, venue, org, oldLogin]);
  await pool.query("INSERT INTO organization_memberships(organization_id,user_id,membership_role,status) VALUES($1,$2,'member','active')", [org, user]);
  const originalCredentials = await credentials();

  // Rename wins: prove issuance is waiting on this exact users row before
  // changing it. A timing-only sleep would not prove the interleaving.
  renameClient = await pool.connect();
  await renameClient.query('BEGIN');
  const blocker = (await renameClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await renameClient.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user]);
  const staleInput = input(oldLogin);
  pending = repositories.sessions.create(staleInput).then(value => ({ value }), error => ({ error }));
  check(await waitForUserLock(blocker), 'Session issuance waits for the rename users-row lock');
  equal(await sessionCount(), 0, 'Blocked issuance has not inserted a session');
  await renameClient.query('UPDATE users SET login=$1 WHERE id=$2', [newLogin, user]);
  await renameClient.query('DELETE FROM auth_sessions WHERE user_id=$1', [user]);
  await renameClient.query('COMMIT');
  renameClient.release(); renameClient = null;
  const rejected = await pending; pending = null;
  equal(rejected.error?.code, 'AUTH_IDENTITY_CHANGED', 'Rename-winning issuance rejects stale login');
  equal(await sessionCount(), 0, 'Rejected issuance leaves no persisted sessions');
  equal(await repositories.sessions.get(staleInput.tokenHash), null, 'Stale token cannot authenticate');
  equal((await pool.query('SELECT login FROM users WHERE id=$1', [user])).rows[0].login, newLogin, 'Rename remains committed');
  equal(await credentials(), originalCredentials, 'Rename race preserves password and PIN hashes');

  // Login wins: issuance commits with the current identity, then the rename
  // transaction removes the issued token exactly as the profile route does.
  const currentInput = input(newLogin);
  equal(await repositories.sessions.create(currentInput), true, 'Current login can issue a session');
  equal(await sessionCount(), 1, 'Login-winning session is persisted');
  equal((await repositories.sessions.get(currentInput.tokenHash))?.userId, user, 'Issued token resolves the same employee');
  renameClient = await pool.connect();
  await renameClient.query('BEGIN');
  await renameClient.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user]);
  await renameClient.query('UPDATE users SET login=$1 WHERE id=$2', [oldLogin, user]);
  equal((await renameClient.query('DELETE FROM auth_sessions WHERE user_id=$1', [user])).rowCount, 1, 'Rename revokes the previously committed session');
  await renameClient.query('COMMIT');
  renameClient.release(); renameClient = null;
  equal(await sessionCount(), 0, 'Login-winning session is gone after rename');
  equal(await repositories.sessions.get(currentInput.tokenHash), null, 'Previously issued token cannot authenticate after rename');
  equal(await credentials(), originalCredentials, 'Login-winning rename preserves credentials');

  // Identity checks also fail closed for a login mismatch or archived user.
  for (const mode of ['mismatch', 'inactive', 'deleted']) {
    if (mode === 'inactive') await pool.query('UPDATE users SET is_active=false WHERE id=$1', [user]);
    if (mode === 'deleted') await pool.query('UPDATE users SET is_active=true,deleted_at=now() WHERE id=$1', [user]);
    const result = await repositories.sessions.create(input(mode === 'mismatch' ? newLogin : oldLogin)).then(value => ({ value }), error => ({ error }));
    equal(result.error?.code, 'AUTH_IDENTITY_CHANGED', `${mode} identity cannot issue a session`);
    equal(await sessionCount(), 0, `${mode} rejection leaves no session`);
  }
  console.log(`STAFF LOGIN RACE POSTGRES QA: PASS (${checks} assertions; deterministic rename wins; login wins; stale identity; inactive/archive; credentials unchanged)`);
} finally {
  if (renameClient) { await renameClient.query('ROLLBACK').catch(() => {}); renameClient.release(); }
  if (pending) await pending;
  await repositories.pool.end();
  try {
    if (touched) {
      await pool.query('DELETE FROM users WHERE id=$1 AND organization_id=$2', [user, org]);
      await pool.query('DELETE FROM venues WHERE id=$1 AND organization_id=$2', [venue, org]);
      await pool.query('DELETE FROM organizations WHERE id=$1', [org]);
    }
  } finally { await pool.end(); }
}

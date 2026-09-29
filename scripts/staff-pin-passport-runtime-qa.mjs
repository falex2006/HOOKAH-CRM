import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url);

async function runServer({ passportKey }) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '0',
      AUTH_REQUIRED: 'true',
      DEMO_MODE: 'true',
      DATABASE_URL: '',
      DEMO_OWNER_PASSWORD: 'demo',
      DEMO_ADMIN_PASSWORD: 'admin',
      STAFF_PASSPORT_KEY: passportKey || ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const deadline = Date.now() + 12000;
    let baseUrl;
    while (!baseUrl && Date.now() < deadline) {
      const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
      if (match) baseUrl = `http://127.0.0.1:${match[1]}`;
      else if (child.exitCode !== null) throw new Error(`CRM exited early: ${output}`);
      else await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(baseUrl, `CRM did not start: ${output}`);
    return { child, baseUrl };
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  assert.equal(response.status, 200, `${username} login failed`);
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

async function request(baseUrl, cookie, path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function createStaff(baseUrl, cookie, suffix, passportData) {
  const response = await request(baseUrl, cookie, '/api/staff', 'POST', {
    name: `QA сотрудник ${suffix}`,
    role: 'bartender',
    login: `qa_${suffix}`,
    password: 'test-pass',
    birthDate: '1990-01-01',
    employmentStartedAt: '2026-01-01',
    ...(passportData === undefined ? {} : { passportData })
  });
  assert.equal(response.status, 201, `staff creation failed: ${JSON.stringify(response.payload)}`);
  return response.payload.id;
}

async function configuredKeyScenario() {
  const { child, baseUrl } = await runServer({ passportKey: 'local-runtime-test-only-key' });
  try {
    const owner = await login(baseUrl, 'owner', 'demo');
    const admin = await login(baseUrl, 'admin', 'admin');
    const id = await createStaff(baseUrl, owner, 'configured', {
      number: '1234567890', issuedAt: '2020-01-02', issuer: 'QA'
    });

    const adminClear = await request(baseUrl, admin, `/api/staff/${id}/profile`, 'PATCH', { passportData: { clear: true } });
    assert.equal(adminClear.status, 403);
    assert.equal(adminClear.payload.error, 'staff_passport_clear_owner_required');

    const emptyUpdate = await request(baseUrl, admin, `/api/staff/${id}/profile`, 'PATCH', { passportData: {} });
    assert.equal(emptyUpdate.status, 200);
    const afterEmpty = await request(baseUrl, owner, `/api/staff/${id}/profile`);
    assert.equal(afterEmpty.payload.passportData.number, '1234567890', 'empty passport payload must preserve existing data');

    const ownerClear = await request(baseUrl, owner, `/api/staff/${id}/profile`, 'PATCH', { passportData: { clear: true } });
    assert.equal(ownerClear.status, 200);
    const afterClear = await request(baseUrl, owner, `/api/staff/${id}/profile`);
    assert.equal(afterClear.payload.passportData, null, 'owner clear must remove passport data');
  } finally {
    child.kill();
  }
}

async function noKeyPinScenario() {
  const { child, baseUrl } = await runServer({ passportKey: '' });
  try {
    const admin = await login(baseUrl, 'admin', 'admin');
    const id = await createStaff(baseUrl, admin, 'no_key');

    const blankPassportUpdate = await request(baseUrl, admin, `/api/staff/${id}/profile`, 'PATCH', {
      name: 'QA сотрудник с PIN', passportData: {}
    });
    assert.equal(blankPassportUpdate.status, 200, 'blank passport fields must not require encryption key');

    const pinUpdate = await request(baseUrl, admin, `/api/staff/${id}/pin`, 'PATCH', { pin: '2468' });
    assert.equal(pinUpdate.status, 200, 'PIN must save independently of passport encryption');
    assert.equal(pinUpdate.payload.pinConfigured, true);

    const updatedProfile = await request(baseUrl, admin, `/api/staff/${id}/profile`);
    assert.equal(updatedProfile.payload.name, 'QA сотрудник с PIN');
    assert.equal(updatedProfile.payload.pinConfigured, true);

    const employee = await login(baseUrl, `qa_no_key`, 'test-pass');
    const firstUnlock = await request(baseUrl, employee, '/api/session/unlock', 'POST', { pin: '2468' });
    assert.equal(firstUnlock.status, 200, 'four-digit PIN unlocks the still-active HTTP session');
    const selfPinUpdate = await request(baseUrl, employee, `/api/staff/${id}/pin`, 'PATCH', { pin: '9753' });
    assert.equal(selfPinUpdate.status, 200, 'employee may change their own PIN without passport encryption');
    const staleUnlock = await request(baseUrl, employee, '/api/session/unlock', 'POST', { pin: '2468' });
    assert.equal(staleUnlock.status, 401, 'old PIN must stop working immediately in the same authenticated session');
    const currentUnlock = await request(baseUrl, employee, '/api/session/unlock', 'POST', { pin: '9753' });
    assert.equal(currentUnlock.status, 200, 'new PIN unlocks without asking for the account password again');
    const stillSignedIn = await request(baseUrl, employee, '/api/session/preferences');
    assert.equal(stillSignedIn.status, 200, 'changing/unlocking PIN preserves the main server session');
    const staffList = await request(baseUrl, admin, '/api/staff');
    assert.equal(staffList.payload.items.find((person) => person.id === id).pinConfigured, true,
      'staff listing reports the PIN as configured');

    const wrongAttempts = [];
    for (let index = 0; index < 5; index += 1) wrongAttempts.push(await request(baseUrl, employee, '/api/session/unlock', 'POST', { pin: '1111' }));
    assert.deepEqual(wrongAttempts.map((result) => result.status), [401, 401, 401, 401, 429], 'repeated guesses are rate limited');
  } finally {
    child.kill();
  }
}

await configuredKeyScenario();
await noKeyPinScenario();
console.log('STAFF PIN/PASSPORT RUNTIME QA: PASS (passport isolation, HTTP PIN setup, same-session PIN change/unlock, preserved login, staff-list state, PIN guessing limit)');

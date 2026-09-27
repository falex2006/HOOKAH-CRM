import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  windowsHide: true,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: '',
    AUTH_REQUIRED: 'true',
    DEMO_ADMIN_PASSWORD: '',
    DEMO_OWNER_PASSWORD: '',
    DEMO_STAFF_PASSWORD: '',
    SAAS_OWNER_EMAIL: '',
    SAAS_OWNER_PASSWORD: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const baseUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('isolated protected server did not start')), 15_000);
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`isolated server exited before readiness (${code})`)); });
  child.stdout.on('data', (chunk) => {
    const match = String(chunk).match(/CRM running on http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
});

try {
  const defaultCredentials = [
    ['admin', 'admin'],
    ['owner', 'demo'],
    ['staff', 'demo'],
    ['platform-owner@example.com', 'saas-demo'],
  ];
  for (const [username, password] of defaultCredentials) {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(response.status, 401, `known default credentials must fail for ${username}`);
    assert.equal((await response.json()).error, 'invalid_credentials');
  }
  for (const username of ['admin', 'owner', 'staff', 'platform-owner@example.com']) {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: '' }),
    });
    assert.equal(response.status, 401, `empty secret must not authenticate ${username}`);
  }
  console.log('SECURITY DEFAULT CREDENTIAL QA: PASS (protected mode with unset secrets rejects all built-in passwords and empty passwords)');
} finally {
  child.kill();
  await once(child, 'exit').catch(() => {});
}

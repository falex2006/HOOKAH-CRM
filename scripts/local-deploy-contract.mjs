import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const deploy = read('deploy-vps.sh');
const migrate = read('migrate-vps.sh');
const compose = read('docker-compose.yml');
const envExample = read('.env.example');
const https = read('nginx/https.conf.example');

for (const script of [deploy, migrate]) {
  assert.match(script, /docker compose version/, 'deployment scripts must require Compose plugin');
}
for (const secret of ['POSTGRES_PASSWORD', 'DEMO_ADMIN_PASSWORD', 'DEMO_OWNER_PASSWORD', 'DEMO_STAFF_PASSWORD', 'STAFF_PASSPORT_KEY', 'SAAS_OWNER_PASSWORD']) {
  assert.match(deploy, new RegExp(`\\b${secret}\\b`), `${secret} must be checked before deployment`);
}
assert.match(deploy, /SAAS_OWNER_EMAIL is required/);
assert.match(deploy, /replace-with|replace-\*/, 'replace placeholders must be rejected');
assert.match(deploy, /AUTH_REQUIRED=true/);
assert.match(deploy, /COOKIE_SECURE=true/);
assert.match(compose, /healthcheck:/);
assert.doesNotMatch(compose, /ports:\s*\n\s*-\s*['"]?5432:/, 'PostgreSQL must not be published publicly');
assert.match(https, /listen 443 ssl http2/);
assert.match(https, /return 301 https:\/\/\$host\$request_uri/);
assert.match(https, /ssl_certificate_key/);
assert.match(https, /Strict-Transport-Security/);
assert.match(envExample, /STAFF_PASSPORT_KEY=replace-/);
assert.equal(existsSync(new URL('../.env', import.meta.url)), false, 'real .env must stay out of the repository');

console.log('LOCAL DEPLOY CONTRACT: PASS (preflight, secrets, healthcheck and HTTPS template)');

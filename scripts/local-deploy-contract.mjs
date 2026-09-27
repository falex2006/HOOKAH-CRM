import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const deploy = read('deploy-vps.sh');
const migrate = read('migrate-vps.sh');
const compose = read('docker-compose.yml');
const envExample = read('.env.example');
const https = read('nginx/https.conf.example');
const server = read('server.js');
const postDeploy = read('post-deploy-acceptance.sh');
const backup = read('backup-postgres.sh');
const gitignore = read('.gitignore');
const dockerfile = read('Dockerfile');

for (const script of [deploy, migrate]) {
  assert.match(script, /docker compose version/, 'deployment scripts must require Compose plugin');
}
for (const secret of ['POSTGRES_PASSWORD', 'DEMO_ADMIN_PASSWORD', 'DEMO_OWNER_PASSWORD', 'DEMO_STAFF_PASSWORD', 'STAFF_PASSPORT_KEY', 'SAAS_OWNER_PASSWORD']) {
  assert.match(deploy, new RegExp(`\\b${secret}\\b`), `${secret} must be checked before deployment`);
}
assert.match(deploy, /SAAS_OWNER_EMAIL is required/);
for (const secret of ['STAFF_PASSPORT_KEY', 'SAAS_OWNER_EMAIL', 'SAAS_OWNER_PASSWORD']) {
  assert.ok(compose.split(/\r?\n/).some(line => line.trim().startsWith(`${secret}:`) && line.includes('${' + secret + ':-')), `${secret} must be forwarded to the CRM container`);
}
assert.match(deploy, /\*@example\.com/);
assert.match(deploy, /replace-with|replace-\*/, 'replace placeholders must be rejected');
assert.match(deploy, /AUTH_REQUIRED=true/);
assert.match(deploy, /COOKIE_SECURE=true/);
assert.match(deploy, /git rev-parse --verify HEAD/, 'deployments must identify a committed release');
assert.match(deploy, /git status --porcelain --untracked-files=all/, 'dirty and untracked release files must block deployment');
assert.match(deploy, /flock 8/, 'parallel deployments must be serialized');
assert.match(deploy, /\/var\/lock\/\$project_name-deploy\.lock/, 'deploy lock must be stable across checkouts of one Compose project');
assert.match(deploy, /config_hash=.*openssl dgst -sha256 -hmac/, 'release identity must include a private-key HMAC of resolved Compose configuration');
assert.match(deploy, /release_fingerprint=.*sha256sum/, 'release fingerprints must not truncate commit or config hashes');
assert.match(deploy, /docker inspect --format/, 'in-progress retries must verify the running container release label');
assert.match(compose, /CRM_RELEASE_ID:/, 'Compose must pass the release id into the service');
assert.match(compose, /com\.territory\.release-id:/, 'Compose container must expose the release id label');
assert.match(dockerfile, /LABEL com\.territory\.release-id=\$CRM_RELEASE_ID/, 'built image must identify its release');
const dockerFiles = new Set([...dockerfile.matchAll(/^COPY (.+) \.\/$/gm)].flatMap(match => match[1].split(/\s+/)));
for (const [, moduleName] of server.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)) {
  const moduleFile = moduleName.endsWith('.js') ? moduleName : `${moduleName}.js`;
  assert.ok(dockerFiles.has(moduleFile), `server runtime module ${moduleFile} must be copied into the CRM image`);
}
assert.match(deploy, /state_dir="\/var\/lib\/territory-crm\/\$project_name"/, 'release state must be shared across checkouts');
assert.match(deploy, /backup_dir="\/var\/backups\/territory-crm\/\$project_name"/, 'release backups must be shared across checkouts');
assert.match(deploy, /openssl dgst -sha256 -hmac/, 'resolved config fingerprints must not expose secrets to offline guessing');
assert.match(deploy, /fingerprint_key" =~ \^\[A-Fa-f0-9\]\{64\}\$/, 'corrupt release fingerprint keys must fail closed');
assert.match(deploy, /deployed\|%s\|%s/, 'release status must retain its backup label');
assert.match(deploy, /in-progress\|%s\|%s/, 'an interrupted attempt must retain its own backup label');
assert.match(deploy, /recovery-\$\(date -u \+%Y%m%dT%H%M%S%N\)/, 'a new recovery attempt must receive a fresh backup while its retry keeps the persisted label');
assert.match(deploy, /already deployed and healthy; skipping duplicate deployment/, 'a healthy identical release must be idempotent');
assert.match(deploy, /BACKUP_LABEL="\$backup_label" \.\/backup-postgres\.sh/, 'each new release attempt must create or reuse its matching pre-release backup');
assert.ok(deploy.indexOf("printf 'in-progress|") < deploy.indexOf('BACKUP_LABEL="$backup_label"'), 'the attempt and backup label must be persisted before writing the snapshot');
assert.ok(deploy.indexOf('BACKUP_LABEL=') < deploy.indexOf('$COMPOSE pull'), 'the database backup must be verified before updating images');
assert.match(backup, /if \[ -e "\$file" \]/, 'repeated releases must reuse a verified backup instead of creating duplicates');
assert.match(backup, /gzip -t "\$file"/, 'a reused backup must be integrity checked');
assert.match(backup, /flock 9/, 'parallel backup attempts must be serialized');
assert.match(backup, /umask 077/, 'temporary dumps must not be world-readable');
assert.match(backup, /tmp_file="\$file\.tmp\.\$\$"/, 'incomplete dumps must stay outside the final backup path');
assert.match(backup, /mv "\$tmp_file" "\$file"/, 'only verified dumps are promoted to final backups');
assert.match(gitignore, /\/backups\//);
assert.match(compose, /healthcheck:/);
assert.doesNotMatch(compose, /ports:\s*\n\s*-\s*['"]?5432:/, 'PostgreSQL must not be published publicly');
assert.match(https, /listen 443 ssl http2/);
assert.match(https, /return 301 https:\/\/\$host\$request_uri/);
assert.match(https, /ssl_certificate_key/);
assert.match(https, /Strict-Transport-Security/);
assert.match(envExample, /STAFF_PASSPORT_KEY=replace-/);
assert.match(envExample, /SAAS_OWNER_EMAIL=platform-owner@example\.com/);
assert.match(server, /platform-owner@example\.com/);
assert.match(server, /configuredApiRateLimit >= 30 && configuredApiRateLimit <= 10000[\s\S]*:\s*180;/, 'API rate limit remains 180 by default and only accepts a bounded operational override');
assert.doesNotMatch(server, /alphasat72@gmail\.com/);
assert.match(postDeploy, /jq -n --arg username/);
assert.equal(existsSync(new URL('../.env', import.meta.url)), false, 'real .env must stay out of the repository');

console.log('LOCAL DEPLOY CONTRACT: PASS (preflight, secrets, healthcheck and HTTPS template)');

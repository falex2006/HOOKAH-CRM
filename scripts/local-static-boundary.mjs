import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A private, disposable local process: no business data or external database.
const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root, windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: '', AUTH_REQUIRED: 'true' },
  stdio: ['ignore', 'pipe', 'pipe']
});
const exited = once(child, 'exit');
try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Local server did not become ready')), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Local server exited before readiness')); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  // Raw HTTP paths ensure encoded traversal cases are not normalized by a URL client.
  const get = (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local request timed out')));
    req.on('error', reject);
    req.end();
  });
  const blocked = [
    '/server.js', '/db.js', '/.env', '/.env.example', '/.git/config', '/.openai/hosting.json',
    '/package.json', '/package-lock.json', '/Dockerfile', '/docker-compose.yml', '/schema.sql',
    '/seed.sql', '/backup-postgres.sh', '/verify-backup.sh', '/scripts/migrate.js', '/dist/app.js',
    '/territory-crm.tar.gz', '/node_modules/pg/package.json', '/STATUS.md',
    '/assets/../server.js', '/assets/%2e%2e/server.js', '/assets/%2e%2e%2fserver.js',
    '/assets/..%5cserver.js', '/%2eenv', '/SERVER.JS', '/server.js?rev=1', '/server.js/'
  ];
  for (const path of blocked) {
    const response = await get(path);
    assert.equal(response.status, 404, `${path} must stay private`);
    assert.equal(response.body, 'Not found', `${path} must not disclose file contents`);
  }
  const routes = ['/', '/login', '/admin', '/inventory', '/finance', '/finance/categories',
    '/finance/report', '/reservations', '/clients', '/orders', '/integrations', '/network', '/delivery', '/platform'];
  const resources = new Set(['/assets/tabler-icons.svg']);
  for (const route of routes) {
    const response = await get(route);
    assert.equal(response.status, 200, route);
    for (const match of response.body.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)) {
      resources.add('/' + match[1].replace(/^\//, ''));
    }
  }
  // Include resources loaded by JS and CSS, not just the initial HTML.
  for (const source of ['app.js', 'portal.js', 'style.css']) {
    const text = readFileSync(new URL('../' + source, import.meta.url), 'utf8');
    for (const match of text.matchAll(/(?:script\.src=|url\()["'](\/[^"']+)["']/g)) resources.add(match[1]);
  }
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const copied = new Set([...dockerfile.matchAll(/^COPY (.+) \.\/$/gm)].flatMap(match => match[1].split(/\s+/)));
  for (const asset of resources) {
    const response = await get(asset);
    assert.equal(response.status, 200, asset);
    assert.ok(response.body.length, `${asset} is empty`);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    if (!asset.startsWith('/assets/')) {
      assert.ok(copied.has(asset.slice(1).split('?')[0]), `${asset} is missing from Docker runtime`);
    }
  }
  const head = await get('/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal((await get('/app.js', 'POST')).status, 405);
  console.log(`LOCAL STATIC BOUNDARY: PASS (${blocked.length} private paths, ${routes.length} routes, ${resources.size} resources and Docker manifest)`);
} finally {
  if (child.exitCode === null) child.kill();
  await exited;
}

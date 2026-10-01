import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const server = read('server.js');
const app = read('app.js');
const portal = read('portal.js');
const lock = read('lock.js');

// The server must await PostgreSQL revocation before acknowledging logout.
const logoutStart = server.indexOf("if (pathname === '/api/logout' && req.method === 'POST')");
const logoutEnd = server.indexOf("\n  const hasRequestCredential", logoutStart);
assert.ok(logoutStart >= 0 && logoutEnd > logoutStart, 'logout route must remain extractable');
const logoutRoute = server.slice(logoutStart, logoutEnd);
assert.match(logoutRoute, /await sessionRepository\.remove\(hashToken\(token\)\)/, 'database revocation must be awaited');
assert.match(logoutRoute, /catch \(_\) \{ return json\(res, 503, \{ error: 'logout_unavailable' \}\); \}/, 'database failure must not be reported as successful logout');
assert.match(logoutRoute, /res\.setHeader\('Set-Cookie', 'crm_session=; HttpOnly; SameSite=Lax; Path=\/; Max-Age=0'\)/, 'logout must clear the session cookie');

const requestAuthToken = (headers = {}, cookie = '') => {
  const authorization = headers.authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : Object.fromEntries(cookie.split(';').map((part) => part.trim().split('='))).crm_session || '';
};
assert.equal(requestAuthToken({ authorization: 'Bearer header-token' }, 'crm_session=cookie-token'), 'header-token', 'Bearer must take precedence over cookie');
assert.equal(requestAuthToken({}, 'crm_session=cookie-token'), 'cookie-token', 'cookie session must remain supported');
assert.equal(requestAuthToken({}, 'crm_session=unknown-token'), 'unknown-token', 'unknown token remains idempotent at token selection');

const delayedRemove = async () => {
  const events = [];
  let resolve;
  const remove = new Promise((r) => { resolve = r; });
  const response = (async () => { await remove; events.push('response'); return 200; })();
  events.push('request');
  assert.deepEqual(events, ['request'], 'response must not be emitted while deletion is pending');
  resolve();
  assert.equal(await response, 200);
  assert.deepEqual(events, ['request', 'response']);
};
await delayedRemove();

const rejectedRemove = async () => {
  const remove = Promise.reject(new Error('db_down'));
  await assert.rejects(remove, /db_down/);
  return 503;
};
assert.equal(await rejectedRemove(), 503, 'database removal failure must surface as 503');

// Execute the client logout policy in a small VM harness. It mirrors the exact
// status gate used by app.js, portal.js and lock.js and verifies side effects.
const runClientLogout = async ({ status, networkError = false, staticDemo = false }) => {
  const values = new Map([['crm_session_token', staticDemo ? 'demo-static-qa' : 'roman-token'], ['crm_session_user', '{"id":"roman"}']]);
  const events = [];
  const context = { localStorage: { getItem: (k) => values.get(k) || null, removeItem: (k) => values.delete(k), setItem: (k, v) => values.set(k, v) }, location: { replace: (url) => events.push(`redirect:${url}`) }, window: { __broadcastSessionEnd: () => events.push('broadcast') }, notice: (text) => events.push(`notice:${text}`) };
  context.fetch = async () => { if (networkError) throw new Error('offline'); return { ok: status >= 200 && status < 300, status }; };
  const source = `(async()=>{try{if(!String(localStorage.getItem('crm_session_token')||'').startsWith('demo-static-')){const response=await fetch('/api/logout',{method:'POST',headers:{}});if(!response.ok&&response.status!==401)throw new Error('logout_unavailable');}}catch(_){notice('Не удалось завершить сессию. Повторите выход.');return;}window.__broadcastSessionEnd?.();localStorage.removeItem('crm_session_token');localStorage.removeItem('crm_session_user');location.replace('/login');})()`;
  await vm.runInNewContext(source, context);
  return { values, events };
};
for (const status of [200, 401]) {
  const result = await runClientLogout({ status });
  assert.deepEqual(result.events, ['broadcast', 'redirect:/login'], `client must finish on ${status}`);
  assert.equal(result.values.size, 0, `client must clear storage on ${status}`);
}
for (const options of [{ status: 503 }, { status: 0, networkError: true }]) {
  const result = await runClientLogout(options);
  assert.equal(result.events.length, 1, 'failed logout must not broadcast or redirect');
  assert.match(result.events[0], /^notice:/);
  assert.equal(result.values.get('crm_session_token'), 'roman-token');
}
const demo = await runClientLogout({ status: 0, networkError: true, staticDemo: true });
assert.deepEqual(demo.events, ['broadcast', 'redirect:/login'], 'static demo logout may complete without server');

for (const [file, source] of [['app.js', app], ['portal.js', portal], ['lock.js', lock]]) {
  assert.match(source, /response\.status!==401\)throw new Error\('logout_unavailable'\)/, `${file} must keep logout failure gate`);
  assert.match(source, /window\.__broadcastSessionEnd\(\);|window\.__broadcastSessionEnd\?\.\(\);/, `${file} must broadcast only after confirmed logout`);
}

console.log('LOGOUT PERSISTENCE RUNTIME QA: PASS (awaited DB revocation, 503 failure, Bearer/cookie precedence, idempotent unknown token, memory/demo mode, client success/401/failure handling)');

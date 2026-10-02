import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../login.js', import.meta.url), 'utf8');
const start = source.indexOf('const finishLogin = async');
const end = source.indexOf('form?.addEventListener', start);
assert.ok(start >= 0 && end > start, 'finishLogin must remain available for runtime identity QA');

const values = new Map([
  ['crm_session_user', JSON.stringify({ id: 'maria', name: 'Мария', role: 'bartender' })],
  ['crm_session_token', 'stale-maria-token'],
]);
const redirects = [];
const context = {
  localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) },
  setLoginState() {},
  async showLoginTransition() {},
  window: { location: { replace: (url) => redirects.push(url) } },
};
vm.runInNewContext(`${source.slice(start, end)}; this.finishLogin=finishLogin;`, context);
await context.finishLogin({ token: 'roman-server-session', user: { id: 'roman', name: 'Печеников Роман Андреевич', role: 'hookah_master' } });

assert.deepEqual(JSON.parse(values.get('crm_session_user')), {
  id: 'roman', name: 'Печеников Роман Андреевич', role: 'hookah_master',
});
assert.equal(values.get('crm_session_token'), 'roman-server-session');
assert.deepEqual(redirects, ['/']);
assert.doesNotMatch(values.get('crm_session_user'), /Мария/);
console.log('LOGIN SERVER IDENTITY RUNTIME QA: PASS (server user overwrites stale cached Maria identity and routes Roman to staff workspace)');

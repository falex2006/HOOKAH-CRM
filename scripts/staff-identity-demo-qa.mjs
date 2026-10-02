import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const { normalizeStaffEmail, normalizeStaffLogin } = createRequire(import.meta.url)('../staff-identity.js');
const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
function section(start, end) {
  const a = portal.indexOf(start), b = portal.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Actual source markers: ${start}`);
  return portal.slice(a, b);
}
const context = vm.createContext({
  portalUser: { id: 'qa-owner', role: 'owner', name: 'QA Owner' },
  portalPermissions: new Set(['staff', 'staff_manage', 'staff_view', 'staff_sensitive']),
  portalPermissionScopes: ['staff'],
  demoState: { staff: [], audit: [] },
  demoSave: () => {},
});
vm.runInContext(section('const normalizeDemoPhones =', '\n'), context);
vm.runInContext(section('const nonCrmStaffRoles =', '\n'), context);
vm.runInContext(section('const demoSensitiveStaffManager =', 'const demoDefaultVenue ='), context);
vm.runInContext('globalThis.demoIdentityApi = (path, method, input = {}) => {\n' +
  section("  if (path === '/api/staff' && method === 'GET')", '  const staffDelete =') +
  '\n}; globalThis.demoEmail = demoNormalizeStaffEmail; globalThis.demoLogin = demoNormalizeStaffLogin;', context);
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message); ++checks; };
const rejects = (fn, error) => { assert.throws(fn, (caught) => caught.message === error); ++checks; };
const api = context.demoIdentityApi;
const update = (id, input) => api(`/api/staff/${id}/profile`, 'PATCH', input);
const snapshot = () => JSON.stringify(context.demoState);

for (const email of [null, '', '  ', 'Roman.Test@EXAMPLE.COM', 'user+tag@example.co.uk', 'name..dot@example.com', 'bad@example', 'a b@example.com', 'a@-bad.com', 12, 'a'.repeat(65) + '@example.com', 'a@' + 'b'.repeat(64) + '.com']) {
  let expected; try { expected = { value: normalizeStaffEmail(email) }; } catch (error) { expected = { error: error.message }; }
  let actual; try { actual = { value: context.demoEmail(email) }; } catch (error) { actual = { error: error.message }; }
  equal(actual, expected, 'Demo and production email normalization match');
}
for (const login of [' Bazinga ', 'Роман_2', 'Case-Sensitive', 'ab', 'email@example.com', null]) {
  let expected; try { expected = { value: normalizeStaffLogin(login) }; } catch (error) { expected = { error: error.message }; }
  let actual; try { actual = { value: context.demoLogin(login) }; } catch (error) { actual = { error: error.message }; }
  equal(actual, expected, 'Demo and production login normalization match');
}
const created = api('/api/staff', 'POST', { name: 'QA Roman', role: 'hookah_master', login: ' Bazinga ', password: 'qa-only', birthDate: '2000-01-01', email: 'Roman.Test@EXAMPLE.COM' });
equal(created.login, 'Bazinga', 'Creation trims login');
equal(created.email, 'Roman.Test@example.com', 'Creation normalizes email domain');
equal('password' in created, false, 'Creation hides password');
equal(api('/api/staff', 'GET').items[0].email, created.email, 'Directory preserves email');
equal(api(`/api/staff/${created.id}/profile`, 'GET').email, created.email, 'Profile readback preserves email');
context.demoState.staff.push({ id: 'qa-inactive', name: 'Inactive', login: 'AlreadyUsed', role: 'bartender', active: false });
let before = snapshot();
rejects(() => update(created.id, { name: 'Should not save', login: 'AlreadyUsed', email: 'new@example.com' }), 'login_already_exists');
equal(snapshot(), before, 'Duplicate inactive login does not save anything');
rejects(() => update(created.id, { name: 'Should not save', email: 'invalid' }), 'invalid_staff_email');
equal(snapshot(), before, 'Invalid email leaves all fields and audit unchanged');
rejects(() => update(created.id, { name: 'Should not save', login: 'NewLogin', telegram: 'invalid' }), 'invalid_telegram');
equal(snapshot(), before, 'Late validation does not partly change identity');
rejects(() => update(created.id, { login: ' ADMIN ' }), 'reserved_staff_login');
equal(snapshot(), before, 'Reserved login rejection is atomic');
const changed = update(created.id, { login: ' NewLogin ', email: 'New.User@EXAMPLE.ORG' });
equal(changed.login, 'NewLogin', 'Rename returns normalized login');
equal(changed.email, 'New.User@example.org', 'Rename persists optional email');
equal(changed.sessionsRevoked, true, 'Changed login signals session revocation');
equal(context.demoState.audit.filter((event) => event.action === 'staff.login_updated').length, 1, 'Rename has dedicated audit');
const contactOnly = update(created.id, { email: null });
equal(contactOnly.email, null, 'Contact email can be cleared');
equal(contactOnly.login, 'NewLogin', 'Contact update preserves login');
equal('sessionsRevoked' in contactOnly, false, 'Contact update does not signal session revocation');
equal('sessionsRevoked' in update(created.id, { login: 'NewLogin' }), false, 'Unchanged login does not revoke sessions');

context.demoState.staff.push({ id: 'qa-admin', name: 'Admin', login: 'ProtectedAdmin', role: 'admin', active: true });
context.portalUser.role = 'admin';
before = snapshot();
rejects(() => update('qa-admin', { role: 'bartender', login: 'OtherAdmin' }), 'staff_role_assignment_required');
equal(snapshot(), before, 'Original privileged role protects rename before role change');
context.demoState.staff.push({ id: 'qa-cleaner', name: 'Cleaner', login: 'staff_qa', role: 'cleaner', active: true });
rejects(() => update('qa-cleaner', { login: 'CleanerLogin' }), 'staff_crm_access_not_configured');
context.portalUser.id = created.id; context.portalUser.role = 'hookah_master';
context.portalPermissions.clear();
equal(update(created.id, { email: 'self@example.com' }).email, 'self@example.com', 'Self can update contact email');
before = snapshot();
rejects(() => update(created.id, { login: 'SelfLogin' }), 'staff_management_required');
equal(snapshot(), before, 'Self rename is denied without staff management');
rejects(() => update('qa-admin', { email: 'other@example.com' }), 'HTTP 403');
context.portalUser.role = 'manager'; context.portalPermissions.add('staff_view');
equal(api('/api/staff/qa-admin/profile', 'GET').login, 'ProtectedAdmin', 'Staff viewer can read existing profile');
rejects(() => update('qa-admin', { login: 'ManagerRename' }), 'HTTP 403');
context.portalUser.role = 'owner'; context.portalUser.id = 'qa-owner';
context.portalPermissions.add('staff_manage');
before = snapshot();
rejects(() => api('/api/staff', 'POST', { name: 'Duplicate', role: 'bartender', login: 'AlreadyUsed', password: 'qa-only', birthDate: '2000-01-01' }), 'login_already_exists');
equal(snapshot(), before, 'Create duplicate does not create or audit a user');
rejects(() => api('/api/staff', 'POST', { name: 'Reserved', role: 'bartender', login: 'staff', password: 'qa-only', birthDate: '2000-01-01' }), 'reserved_staff_login');
for (const secret of ['passwordHash', 'pinCode', 'pinHash']) context.demoState.staff[0][secret] = 'qa-only';
equal(['password', 'passwordHash', 'pinCode', 'pinHash'].some((key) => key in api(`/api/staff/${created.id}/profile`, 'GET')), false, 'Profile hides authentication secrets');
assert.match(portal, /id="staff-email" name="email" type="email" maxlength="254"/); ++checks;
assert.match(portal, /email: form\.querySelector\('\[name="email"\]'\)\?\.value\.trim\(\) \|\| null/); ++checks;
assert.match(portal, /staff-admin-card\.js\?rev=11/); ++checks;

// Execute the actual submit handler. Own login revocation redirects immediately,
// so combining it with a PIN update must be stopped before any profile PATCH.
const card = fs.readFileSync(new URL('../staff-admin-card.js', import.meta.url), 'utf8');
const submitStart = card.indexOf('form.onsubmit=async(event)=>');
const submitEnd = card.indexOf('\n  };', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, 'Actual card submit handler markers'); ++checks;
const submitSource = card.slice(submitStart, submitEnd);
async function exerciseCardSubmit({ self, changed, pin = '', confirm = '' }) {
  const message = { textContent: '' }, submitButton = { disabled: false };
  const fields = Object.fromEntries(Object.entries({ login:changed ? 'NewOwnLogin' : 'ExistingLogin',
    telegram:'', name:'Synthetic owner',role:'owner',email:'',employmentStartedAt:'2026-06-03',workNotes:'',
    pin_new:pin,pin_confirm:confirm }).map(([key,value])=>[key,{value}]));
  fields.confirm_login = { checked:true };
  const form = { dataset:{},elements:fields,querySelector:()=>submitButton };
  const calls = [];
  const sandbox = vm.createContext({ form,modal:{querySelector:()=>message},list:{querySelectorAll:()=>[]},
    canChangeLogin:true,canAssignRole:false,person:{login:'ExistingLogin',role:'owner'},
    portalUser:{id:'qa-owner',role:'owner'},id:self ? 'qa-owner' : 'qa-colleague',passportPayload:()=>({}),
    api:async(path,options)=>{calls.push({path,options});throw new Error('expected_runtime_boundary');} });
  vm.runInContext(submitSource,sandbox);
  await form.onsubmit({preventDefault(){}});
  return {calls,message:message.textContent,submitting:form.dataset.submitting,disabled:submitButton.disabled};
}
for (const input of [{pin:'6569',confirm:'6569'},{pin:'',confirm:'6569'}]) {
  const result = await exerciseCardSubmit({self:true,changed:true,...input});
  equal(result.calls.length,0,'Own login and PIN conflict stops before profile PATCH');
  assert.match(result.message,/PIN/i); ++checks;
  if (input.pin) {
    assert.match(result.message,/логин/i); ++checks;
    assert.match(result.message,/отдель|сначала|по очереди/i); ++checks;
  } else { assert.match(result.message,/одинаковый|повтор/i); ++checks; }
  equal(result.disabled,false,'Conflict leaves save button usable');
  equal(result.submitting==='1',false,'Conflict does not leave submission locked');
}
equal((await exerciseCardSubmit({self:true,changed:false,pin:'6569',confirm:'6569'})).calls.length,1,'Unchanged own login permits PIN save');
equal((await exerciseCardSubmit({self:false,changed:true,pin:'6569',confirm:'6569'})).calls.length,1,'Colleague identity and PIN can reach profile PATCH');
console.log(`PASS staff identity static demo: ${checks} checks`);

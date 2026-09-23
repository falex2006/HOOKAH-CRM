const assert = require('node:assert/strict');
const policy = require('../work-context');
const all = ['floor','orders','reservations','inventory_read','finance','settings','staff_manage','loyalty'];
let checks = 0;
for (const role of ['owner','admin','developer']) {
 for (const mode of ['staff','bartender','hookah_master']) {
  const context = policy.resolve({role},mode,all);
  assert.equal(context.mode,mode);
  assert.equal(context.permissions.includes('settings'),false);
  assert.equal(policy.route(context,'/clients'),`/clients?mode=${mode}`);
  assert.equal(policy.canVisit(context,'/admin'),false);
  checks += 4;
 }
}
for (const role of ['bartender','senior_bartender','hookah_master','senior_hookah_master','staff','manager']) {
 const context = policy.resolve({role},null,['floor','orders']);
 assert.equal(context.canReturn,false);
 assert.equal(policy.canVisit(context,'/inventory'),false);
 assert.throws(()=>policy.resolve({role},'admin',all),/forbidden/);
 assert.throws(()=>policy.route(context,'/admin'),/forbidden/);
 checks += 4;
}
const limited = policy.resolve({role:'owner'},'bartender',['floor']);
assert.deepEqual(limited.permissions,['floor']);
assert.throws(()=>policy.route(limited,'https://example.com/'),/external/);
console.log(`Work context: ${checks + 2} assertions passed`);

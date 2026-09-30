import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateQaDatabaseUrl, assertQaDatabaseIdentity } from './postgres-qa-safety.mjs';
import { createRequire } from 'node:module';
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf("  if (pathname === '/api/deliveries' && req.method === 'GET')");
const end = source.indexOf("  if (pathname === '/api/tasks' && req.method === 'GET')", start);
assert.ok(start > 0 && end > start);
const handler = new Function('pathname','req','res','repositories','venueDbId','denyUnless','body','json','recordAudit','deliveries','process', `return (async()=>{${source.slice(start,end)}})()`);
const memory = [], audits = [];
const call = async (pool, venue, method='GET', id='', input={}, allowed=true, configured=Boolean(pool)) => {
  let response;
  await handler(`/api/deliveries${id ? '/'+id : ''}`, {method}, {}, {pool}, venue,
    (_req,_res,permission) => { assert.equal(permission,'delivery'); if (!allowed) { response={status:403}; return true; } return false; },
    async()=>input, (_res,status,data)=>response={status,data}, (_req,action,type,id,before,after)=>audits.push({action,before,after}), memory,
    {env:{DATABASE_URL:configured?'configured':''}});
  return response;
};
const sample={customerName:'Delivery QA',address:'QA address',total:850.5,paymentMethod:'card'};
async function check(pool, a, b) {
  for (const total of [-1, 1e12, 'NaN', 'Infinity']) assert.equal((await call(pool,a,'POST','',{...sample,total})).status,400);
  const rounded = await call(pool,a,'POST','',{...sample,total:1.235}); assert.equal(rounded.status,201); assert.equal(rounded.data.total,1.24);
  const maximum = await call(pool,a,'POST','',{...sample,total:999999999999.99}); assert.equal(maximum.status,201); assert.equal(maximum.data.total,999999999999.99);
  const created=await call(pool,a,'POST','',sample); assert.equal(created.status,201); const id=created.data.id;
  assert.equal(created.data.total,850.5); assert.ok(!('venueId' in created.data)); assert.ok(!('venue_id' in created.data)); assert.equal(created.data.paymentMethod,'card');
  assert.ok((await call(pool,a)).data.items.some(x=>x.id===id));
  assert.equal((await call(pool,b)).data.items.length,0);
  assert.equal((await call(pool,b,'PATCH',id,{status:'delivered'})).status,404);
  assert.equal((await call(pool,a,'PATCH',id,{status:'bad'})).status,400);
  assert.equal((await call(pool,a,'PATCH',id,{status:'delivered'},false)).status,403);
  const changed=await call(pool,a,'PATCH',id,{status:'in_delivery',courier:'QA courier'}); assert.equal(changed.status,200);
  assert.equal(changed.data.courier,'QA courier'); assert.equal(audits.at(-1).before.status,'new');
  assert.equal((await call(pool,a)).data.items.find(x=>x.id===id).status,'in_delivery');
  return id;
}
await check(null,'tenant-a','tenant-b');
for (const method of ['GET','POST','PATCH']) {
  const failed=await call({query:async()=>{throw Error('offline')},connect:async()=>{throw Error('offline')}},'tenant-a',method,method==='PATCH'?'00000000-0000-0000-0000-000000000001':'',sample,true,true);
  assert.equal(failed.status,503);
}
assert.equal((await call(null,'tenant-a','GET','',{},true,true)).status,503,'configured DB must not leak memory records');
console.log('DELIVERY MEMORY AND FAILURE QA: PASS');
const databaseUrl=process.env.MIGRATIONS_PG_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = validateQaDatabaseUrl(databaseUrl);
  const {Pool}=createRequire(import.meta.url)('pg');
  let pool=new Pool({connectionString:databaseUrl}); let a,b;
  try {
    const identity = (await pool.query(`SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port,COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false) AS superuser`)).rows[0];
    assertQaDatabaseIdentity(identity,target.database,Number(target.url.port || 5432),'Delivery QA');
    const migration=fs.readFileSync(new URL('../migrations/050_deliveries.sql',import.meta.url),'utf8');
    await pool.query(migration); await pool.query(migration);
    a=(await pool.query("INSERT INTO venues(name) VALUES ('Delivery QA') RETURNING id")).rows[0].id;
    b=(await pool.query("INSERT INTO venues(name) VALUES ('Delivery tenant QA') RETURNING id")).rows[0].id;
    const id=await check(pool,a,b);
    await pool.end(); pool=new Pool({connectionString:databaseUrl});
    const read=(await call(pool,a)).data.items.find(x=>x.id===id);
    assert.equal(read.status,'in_delivery'); assert.equal(read.courier,'QA courier');
    assert.equal((await call(pool,a,'PATCH','invalid',{status:'delivered'})).status,404);
    console.log('DELIVERY POSTGRESQL REPLAY, TENANT AND NEW CONNECTION QA: PASS');
  } finally {
    if(a) await pool.query('DELETE FROM venues WHERE id=ANY($1::uuid[])',[[a,b].filter(Boolean)]);
    await pool.end();
  }
}

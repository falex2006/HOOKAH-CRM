import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf("  if (pathname === '/api/network/venues' && req.method === 'GET')");
const end = source.indexOf("  if (pathname === '/api/network/venues' && req.method === 'POST')", start);
assert.ok(start > 0 && end > start);
const handler = new Function('repositories', 'process', 'json', `return (async()=>{
 const pathname='/api/network/venues',req={method:'GET'},res={};
 const denyUnlessAny=()=>false,canManageVenueIdentity=()=>true;
 const requestOrganizationId=()=> 'qa-org',requireOrganizationContext=()=>false;
 const venueDbId='qa-current',currentVenueId='memory';
 const networkVenues=[{id:'memory',status:'active'}];
 ${source.slice(start,end)}
})()`);
async function call(pool, configured) {
 let response;
 await handler({pool},{env:{DATABASE_URL:configured?'configured':''}},(_res,status,data)=>response={status,data});
 return response;
}
for (const pool of [null,{query:async()=>{throw Error('private database diagnostic');}}]) {
 const result=await call(pool,true);
 assert.deepEqual(result,{status:503,data:{error:'network_unavailable'}});
}
assert.equal((await call(null,false)).data.items[0].id,'memory');
const result=await call({query:async(sql,values)=>{
 assert.match(sql,/organization_id=\$1/); assert.deepEqual(values,['qa-org']);
 return {rows:[{id:'qa-current',isCurrent:false},{id:'other-session',isCurrent:true}]};
}},true);
assert.equal(result.status,200);assert.equal(result.data.items[0].id,'qa-current');
assert.deepEqual(result.data.items.map(item=>item.isCurrent),[true,false], 'current marker follows caller session, not organization flag');
console.log('NETWORK READ FAILURE QA: PASS (configured database fails closed; memory only in explicit memory mode)');

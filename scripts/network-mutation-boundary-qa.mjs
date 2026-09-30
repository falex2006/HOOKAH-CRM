import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('  const networkVenuePath =');
const end=source.indexOf("  if (pathname === '/api/finance/categories'",start);
assert.ok(start>0&&end>start);
const handler=new Function('pathname','req','repositories','process','json','networkVenues',`return (async()=>{
 const res={},denyUnless=()=>false,canManageVenueIdentity=()=>true,requireOrganizationContext=()=>false;
 const body=async()=>({name:'changed'}),recordAudit=()=>{throw Error('unexpected audit')};
 const currentVenueId='other';
 ${source.slice(start,end)}
})()`);
for(const method of ['PATCH','DELETE','POST']) {
 for(const id of ['venue-memory','------------------------------------','not-a-uuid']) {
  const memory=[{id,status:'active',name:'original'}];let response;
  await handler('/api/network/venues/'+id+(method==='POST'?'/select':''),{method},
   {pool:{query:()=>{throw Error('unexpected SQL')},connect:()=>{throw Error('unexpected connection')}}},
   {env:{DATABASE_URL:'configured'}},(_res,status,data)=>response={status,data},memory);
  assert.deepEqual(response,{status:404,data:{error:'venue_not_found'}});
  assert.equal(memory[0].name,'original');assert.equal(memory[0].status,'active');
 }
 let response;
 await handler('/api/network/venues/venue-memory'+(method==='POST'?'/select':''),{method},{pool:null},
  {env:{DATABASE_URL:'configured'}},(_res,status,data)=>response={status,data},[]);
 assert.deepEqual(response,{status:503,data:{error:'network_unavailable'}});
}
console.log('NETWORK MUTATION BOUNDARY QA: PASS (invalid IDs and unavailable configured pool cannot enter memory writes)');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('  const networkVenuePath =');
const end=source.indexOf("  if (networkVenuePath && req.method === 'DELETE')",start);
const id='00000000-0000-0000-0000-000000000002';
const handler=new Function('input','pool','json','networkVenues',`return (async()=>{
 const pathname='/api/network/venues/${id}',req={method:'PATCH'},res={},repositories={pool};
 const process={env:{DATABASE_URL:pool?'configured':''}};
 const denyUnless=()=>false,canManageVenueIdentity=()=>true,requireOrganizationContext=()=>false;
 const requestOrganizationId=()=> 'org',body=async()=>input,isValidIanaTimezone=()=>true;
 const recordAudit=()=>{},currentVenueId='other',venueDbId='other';
 ${source.slice(start,end)}
})()`);
for(const database of [false,true])for(const key of ['name','city','address'])for(const value of ['',null,'   ']) {
 const memory=[{id,status:'active',name:'original',city:'city',address:'address'}];let response;
 const pool=database?{query:()=>{throw Error('validation must precede SQL');}}:null;
 await handler({[key]:value},pool,(_res,status,data)=>response={status,data},memory);
 assert.equal(response.status,400);assert.equal(response.data.error,'venue_name_city_address_required');
 assert.deepEqual(memory,[{id,status:'active',name:'original',city:'city',address:'address'}]);
}
let response;const memory=[{id,status:'active',name:'original',city:'city',address:'address'}];
await handler({name:' updated '},null,(_res,status,data)=>response={status,data},memory);
assert.equal(response.status,200);assert.equal(memory[0].name,'updated');
assert.equal(memory[0].city,'city');assert.equal(memory[0].address,'address');
console.log('NETWORK PATCH VALIDATION QA: PASS (blank required fields rejected before mutation in both storage modes; partial update preserved)');

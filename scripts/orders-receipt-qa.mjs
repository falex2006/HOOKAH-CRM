import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf("document.querySelector('#print-receipt')?.addEventListener('click',()=>{");
const end=source.indexOf("\ndocument.querySelector('#split-order')",start);
function run(order,blocked=false){
  let listener,html='',features,closed=false;
  const notices=[];const popup={opener:{},document:{write:value=>html=value,close:()=>closed=true}};
  new Function('document','window','currentOrder','notice','displayProductName',source.slice(start,end))(
    {querySelector:()=>({addEventListener:(type,fn)=>listener=fn})},
    {open:(url,target,opts)=>{features=opts;return blocked?null:popup;}},order,msg=>notices.push(msg),String);
  listener();return {html,features,closed,popup,notices};
}
const order={id:'safe<&',status:'closed',closedAt:'2026-09-28T12:00:00Z',finalTotal:117,items:[{name:'<script>bad</script>',unitPrice:130,quantity:1}]};
let result=run(order);
assert.ok(result.html.includes('Итого: 117 ₽'));assert.ok(result.html.includes('28.09.2026'));
assert.ok(result.html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.equal(result.popup.opener,null);
assert.equal(result.closed,true);assert.ok(!result.features.includes('noopener'));
result=run({...order,finalTotal:0});assert.ok(result.html.includes('Итого: 0 ₽'));
result=run({...order,status:'open',createdAt:'2026-09-27T12:00:00Z'});assert.ok(result.html.includes('Итого: 130 ₽'));assert.ok(result.html.includes('27.09.2026'));
assert.equal(run({...order,status:'cancelled'}).html,'');assert.equal(run(order,true).notices.length,1);
console.log('Orders receipt QA PASS: final total, zero, historical date, escaping, opener isolation, blocked popup and cancelled guard.');

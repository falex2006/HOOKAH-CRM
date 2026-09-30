import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../portal.js',import.meta.url),'utf8');
const start=source.indexOf("  api('/api/integrations').then");
const end=source.indexOf('\n}',start);
assert.ok(start>0 && end>start);
for(const scenario of ['enabled','disabled','error']) {
  const nodes=new Map(['status','note','help'].map(key=>[`#telegram-integration-${key}`,{textContent:'',className:''}]));
  const document={querySelector:id=>nodes.get(id)};
  const api=()=>scenario==='error'?Promise.reject(Error('offline')):Promise.resolve({telegram:{enabled:scenario==='enabled'}});
  await new Function('document','api',`return ${source.slice(start,end).trim()}`)(document,api);
  assert.equal(nodes.get('#telegram-integration-status').textContent,{enabled:'Подключено',disabled:'В разработке',error:'Статус недоступен'}[scenario]);
  assert.ok(nodes.get('#telegram-integration-note').textContent.length>0);
  if(scenario==='error') assert.match(nodes.get('#telegram-integration-help').textContent,/не подтверждено/);
}
console.log('INTEGRATIONS STATUS RUNTIME QA: PASS (enabled, unavailable feature, request failure)');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../portal.js',import.meta.url),'utf8');
const start=source.indexOf('  let actionPending = false;');
const end=source.indexOf('  let creating = false;',start);
assert.ok(start>0&&end>start);
for(const type of ['network-select','network-archive','network-edit']) {
 let listener,requests=0,resolve,reject;const notices=[];
 const button={dataset:{venue:'qa'},disabled:false,isConnected:true,textContent:'Original',classList:{contains:name=>name===type}};
 const event={target:{closest:selector=>selector==='[data-venue]'?button:null}};
 new Function('document','api','portalNotice','portalConfirm','portalAction','load','window','refreshPortalContext',`${source.slice(start,end)}`)(
 {querySelector:()=>({addEventListener:(_name,fn)=>listener=fn})},()=>{requests++;return new Promise((a,b)=>{resolve=a;reject=b;});},(...args)=>notices.push(args),async()=>true,async()=>({name:'QA',address:'QA'}),async()=>{}, {__networkItems:[{id:'qa',name:'QA',address:'QA'}]},async()=>({failed:[]}));
 const first=listener(event);await Promise.resolve();await Promise.resolve();
 assert.equal(button.disabled,true);await listener(event);assert.equal(requests,1);
 reject(Error('offline'));await first;assert.equal(button.disabled,false);assert.equal(button.textContent,'Original');
 assert.equal(notices.at(-1)[1],'error');
 const retry=listener(event);await Promise.resolve();await Promise.resolve();resolve({});await retry;
 assert.equal(requests,2);assert.equal(button.disabled,false);assert.equal(notices.at(-1)[1],'success');
}
for (const type of ['network-archive', 'network-edit']) {
 let listener, finishDialog, requests=0, dialogs=0, focused=0;
 const button={dataset:{venue:'qa'},disabled:false,isConnected:true,textContent:'Original',getClientRects:()=>[{}],focus(){assert.equal(this.disabled,false);focused++;},classList:{contains:name=>name===type}};
 const event={target:{closest:selector=>selector==='[data-venue]'?button:null}};
 const dialog=()=>{dialogs++;return new Promise(resolve=>{finishDialog=resolve;});};
 new Function('document','api','portalNotice','portalConfirm','portalAction','load','window',source.slice(start,end))(
  {querySelector:()=>({addEventListener:(_name,fn)=>listener=fn})},async()=>{requests++;},()=>{},dialog,dialog,async()=>{}, {__networkItems:[{id:'qa',name:'QA',address:'QA'}]});
 const first=listener(event);
 assert.equal(dialogs,1);assert.equal(button.disabled,true);
 await listener(event);assert.equal(dialogs,1);assert.equal(requests,0);
 const other={dataset:{venue:'other'},disabled:false,classList:{contains:name=>name==='network-select'}};
 await listener({target:{closest:selector=>selector==='[data-venue]'?other:null}});
 assert.equal(requests,0,'other venue action is suppressed while dialog is pending');
 finishDialog(null);await first;
 assert.equal(button.disabled,false);assert.equal(button.textContent,'Original');assert.equal(requests,0);assert.equal(focused,1);
 const second=listener(event);assert.equal(dialogs,2);
 button.isConnected=false;finishDialog(null);await second;assert.equal(focused,1,'detached opener is not focused');
 button.isConnected=true;button.disabled=false;
 const third=listener(event);assert.equal(dialogs,3);finishDialog(null);await third;
 assert.equal(button.disabled,false);assert.equal(requests,0);
}
console.log('NETWORK ACTION PENDING QA: PASS (duplicate suppression during requests/dialogs, cancellation, detached button, failure recovery and successful retry)');

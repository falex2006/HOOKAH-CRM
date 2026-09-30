import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../portal.js',import.meta.url),'utf8');
const start=source.indexOf('  escape = (event) => {',source.indexOf('const portalAction ='));
const end=source.indexOf(" document.addEventListener('keydown', escape);",start);
assert.ok(start>0 && end>start);
let focus;
const node=(name,tabIndex=0)=>({name,tabIndex,disabled:false,getAttribute:()=>null,getClientRects:()=>[{}],focus(){focus=this;document.activeElement=this;}});
const first=node('close'), last=node('submit'), hidden=node('hidden');hidden.getClientRects=()=>[];
const disabled=node('disabled');disabled.disabled=true;
const modal={querySelectorAll:()=>[first,hidden,disabled,last],contains:n=>[first,last].includes(n),focus(){focus=this;}};
const document={activeElement:first,querySelectorAll:()=>[modal]};let closes=0;
const key=new Function('document','modal','close',`let escape;${source.slice(start,end)};return escape;`)(document,modal,()=>closes++);
const event=(key,shiftKey=false)=>({key,shiftKey,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});
let e=event('Tab',true);key(e);assert.equal(focus,last);assert.equal(e.defaultPrevented,true);
e=event('Tab');key(e);assert.equal(focus,first);assert.equal(e.defaultPrevented,true);
document.activeElement={};e=event('Tab');key(e);assert.equal(focus,first);
e=event('Escape');e.defaultPrevented=true;key(e);assert.equal(closes,0,'dropdown-consumed Escape must not dismiss dialog');
key(event('Escape'));assert.equal(closes,1);
document.querySelectorAll=()=>[modal,{}];key(event('Escape'));assert.equal(closes,1,'only top action dialog reacts');
assert.match(source,/opener\?\.isConnected && !opener.disabled/);
assert.match(source,/fallback.focus\(\{ preventScroll: true \}\)/);
assert.match(source,/modal.setAttribute\('aria-labelledby', labelId\)/);
assert.match(source,/firstField \|\| modal.querySelector\('\.modal-cancel'\)/);
const closeStart=source.indexOf('  let closed = false;',source.indexOf('const portalAction ='));
const closeEnd=source.indexOf("  modal.querySelector('.modal-close')",closeStart);
for(const mode of ['connected','removed','disabled']) {
  let removals=0, cleanups=0, resolutions=0, restored=null;
  const opener={isConnected:mode!=='removed',disabled:mode==='disabled',getClientRects:()=>[{}],focus(){restored='opener';}};
  const fallback={tabIndex:0,getAttribute:()=>null,removeAttribute(name){assert.equal(name,'tabindex');},focus(){restored='fallback';}};
  const document={removeEventListener(type){assert.equal(type,'keydown');cleanups++;},querySelector:()=>fallback};
  const modal={remove(){removals++;}};
  const close=new Function('opener','document','modal','resolve',`let escape=()=>{};${source.slice(closeStart,closeEnd)};return close;`)(opener,document,modal,()=>resolutions++);
  close(null);close(null);
  assert.equal(restored,mode==='connected'?'opener':'fallback');assert.equal(removals,1);assert.equal(cleanups,1);assert.equal(resolutions,1);
}
console.log('PORTAL ACTION MODAL KEYBOARD QA: PASS (Tab loop, outside focus, consumed Escape, top modal, restore/name contracts)');

assert.match(readFileSync(new URL('../style.css',import.meta.url),'utf8'),/\.action-modal\{z-index:70\}/,'dialog overlays mobile navigation layers');

assert.match(readFileSync(new URL('../style.css',import.meta.url),'utf8'),/\.action-box\{box-sizing:border-box;max-height:calc\(100vh - 32px\);max-height:calc\(100dvh - 32px\);overflow-y:auto/,'short dialogs scroll within viewport');

const focusoutStart=source.indexOf("  wrapper.addEventListener('focusout'");
const focusoutEnd=source.indexOf('\n',focusoutStart);
assert.ok(focusoutStart>0);
let focusoutHandler, menuCloses=0;
const inside={};
const wrapper={contains:node=>node===inside,addEventListener(type,handler){assert.equal(type,'focusout');focusoutHandler=handler;}};
new Function('wrapper','close',source.slice(focusoutStart,focusoutEnd))(wrapper,()=>menuCloses++);
focusoutHandler({relatedTarget:inside});assert.equal(menuCloses,0);
focusoutHandler({relatedTarget:{}});assert.equal(menuCloses,1);
focusoutHandler({relatedTarget:null});assert.equal(menuCloses,2);
console.log('CUSTOM SELECT FOCUSOUT QA: PASS (internal focus retained, external/blur closes)');

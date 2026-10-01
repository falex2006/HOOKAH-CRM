import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../auth-smoke.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../auth-smoke.css',import.meta.url),'utf8');
assert.match(css,/\.login:has\(\.auth-smoke-backdrop\)>\.login-card\{[^}]*max-height:none;overflow:visible/,'low login scrolls the page instead of clipping the card');
assert.match(css,/:root:has\(\.login>\.auth-smoke-backdrop\)\{color-scheme:dark;scrollbar-width:thin/);

function fixture({reduced=false,pin=false,reject=false}={}) {
  let queued=false, callback, creates=0, writes=0;
  const changes=()=>{queued=true;writes++;};
  const listeners=new Map(), motionListeners=new Map();
  const host={hidden:false,parentElement:null,aria:pin?'true':null,getAttribute(name){return name==='aria-hidden'?this.aria:null;}};
  const classes=new Set();
  const backdrop={hidden:false,isConnected:true,parentElement:host,
    classList:{contains:name=>classes.has(name),toggle(name,force){const before=classes.has(name);if(force)classes.add(name);else classes.delete(name);if(before!==classes.has(name))changes();}},
    closest:selector=>selector===(pin?'.screen-lock-overlay':'.login')?host:null,
    prepend(video){this.video=video;changes();}
  };
  const media={matches:reduced,addEventListener:(event,fn)=>motionListeners.set(event,fn)};
  const document={hidden:false,documentElement:{},querySelectorAll:()=>backdrop.isConnected?[backdrop]:[],
    addEventListener:(event,fn)=>listeners.set(event,fn),createElement(){creates++;return {
      calls:0,pauses:0,paused:true,events:{},setAttribute(){},addEventListener(event,fn){this.events[event]=fn;},
      play(){this.calls++;this.paused=false;return reject?Promise.reject(new Error('autoplay blocked')):Promise.resolve();},
      pause(){this.pauses++;this.paused=true;},remove(){changes();}
    };}
  };
  const context={document,window:{matchMedia:()=>media,getComputedStyle:()=>({display:'block',visibility:'visible'})},
    MutationObserver:function(fn){callback=fn;return {observe(){}};}};
  const flush=()=>{let turns=0;while(queued){assert.ok(++turns<12,'observer must converge');queued=false;callback([]);}return turns;};
  const run=()=>{vm.runInNewContext(source,context);flush();};
  const preference=value=>{media.matches=value;motionListeners.get('change')?.({matches:value});flush();};
  const visibility=value=>{document.hidden=!value;listeners.get('visibilitychange')?.();flush();};
  const overlay=value=>{host.aria=value?'false':'true';changes();flush();};
  return {backdrop,host,document,context,run,flush,preference,visibility,overlay,callback:()=>callback([]),get creates(){return creates;},get writes(){return writes;}};
}

const login=fixture();login.run();
const video=login.backdrop.video;
assert.equal(login.creates,1);assert.equal(video.calls,1);
assert.equal(video.loop,true);assert.equal(video.muted,true);assert.equal(video.playsInline,true);
video.events.playing();assert.ok(login.flush()<3);assert.ok(login.backdrop.classList.contains('video-ready'));
const writes=login.writes;
for(let i=0;i<20;i++)login.callback();
assert.equal(login.writes,writes,'stable callback cannot write classes');assert.equal(video.calls,1);
login.run();assert.equal(login.creates,1,'double bundle cannot create duplicate video');
login.visibility(false);assert.equal(video.paused,true);
login.visibility(true);assert.equal(video.calls,2);
login.preference(true);assert.equal(video.paused,true);
login.preference(false);assert.equal(video.calls,3);
video.events.error();login.flush();assert.equal(video.paused,true);
assert.ok(login.backdrop.classList.contains('video-fallback'));assert.ok(!login.backdrop.classList.contains('video-ready'));
login.visibility(false);login.visibility(true);assert.equal(video.calls,3,'failed video stays static');

const reduced=fixture({reduced:true});reduced.run();assert.equal(reduced.creates,0,'initial reduce must not request video');
reduced.preference(false);assert.equal(reduced.creates,1);assert.equal(reduced.backdrop.video.calls,1);
reduced.preference(true);assert.equal(reduced.backdrop.video.paused,true);

const pin=fixture({pin:true});pin.run();assert.equal(pin.creates,0,'hidden PIN must not create video');
pin.overlay(true);assert.equal(pin.creates,1);assert.equal(pin.backdrop.video.calls,1);
pin.overlay(false);assert.equal(pin.backdrop.video.paused,true);
pin.overlay(true);assert.equal(pin.creates,1);assert.equal(pin.backdrop.video.calls,2);
pin.backdrop.isConnected=false;pin.callback();pin.flush();assert.equal(pin.backdrop.video.paused,true);
pin.backdrop.isConnected=true;pin.callback();pin.flush();assert.equal(pin.creates,2,'reconnected backdrop mounts once');

const rejected=fixture({reject:true});rejected.run();await Promise.resolve();await Promise.resolve();rejected.flush();
assert.ok(rejected.backdrop.classList.contains('video-fallback'));assert.equal(rejected.backdrop.video.paused,true);
for(let i=0;i<20;i++)rejected.callback();assert.equal(rejected.backdrop.video.calls,1);
console.log('AUTH SMOKE LIFECYCLE RUNTIME QA: PASS (real preference changes, hidden PIN mount/pause/resume, visibility, play rejection, detach/reconnect, double bundle and observer convergence)');

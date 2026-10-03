import assert from 'node:assert/strict';
import fs from 'node:fs';

const mp4Path = new URL('../assets/login-smoke-ambient.mp4', import.meta.url);
const pngPath = new URL('../assets/login-smoke-ambient.png', import.meta.url);
assert.ok(fs.existsSync(mp4Path), 'login smoke MP4 must be present in source assets');
assert.ok(fs.existsSync(pngPath), 'login smoke PNG fallback must be present in source assets');
assert.ok(fs.existsSync(new URL('../dist/assets/login-smoke-ambient.mp4', import.meta.url)), 'dist must include smoke MP4');
assert.ok(fs.existsSync(new URL('../dist/assets/login-smoke-ambient.png', import.meta.url)), 'dist must include smoke PNG');
assert.equal(fs.readFileSync(mp4Path).length, fs.readFileSync(new URL('../dist/assets/login-smoke-ambient.mp4', import.meta.url)).length, 'dist MP4 must match source');
assert.equal(fs.readFileSync(pngPath).length, fs.readFileSync(new URL('../dist/assets/login-smoke-ambient.png', import.meta.url)).length, 'dist PNG must match source');
assert.deepEqual(fs.readFileSync(mp4Path), fs.readFileSync(new URL('../dist/assets/login-smoke-ambient.mp4', import.meta.url)), 'dist MP4 bytes must match source');
assert.deepEqual(fs.readFileSync(pngPath), fs.readFileSync(new URL('../dist/assets/login-smoke-ambient.png', import.meta.url)), 'dist PNG bytes must match source');
assert.equal(fs.readFileSync(new URL('../auth-smoke.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../dist/auth-smoke.js', import.meta.url), 'utf8'), 'dist auth-smoke.js must match source');
assert.equal(fs.readFileSync(new URL('../auth-smoke.css', import.meta.url), 'utf8'), fs.readFileSync(new URL('../dist/auth-smoke.css', import.meta.url), 'utf8'), 'dist auth-smoke.css must match source');
const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
assert.match(dockerfile, /auth-smoke\.js/); assert.match(dockerfile, /auth-smoke\.css/); assert.match(dockerfile, /COPY\s+assets\s+\.\/assets/);

const base = process.argv[2] || 'http://127.0.0.1:3107';
const get = async (path, headers = {}) => fetch(base + path, { headers });
const head = await fetch(base + '/assets/login-smoke-ambient.mp4', { method: 'HEAD' });
assert.equal(head.status, 200, 'MP4 HEAD must be served');
assert.match(head.headers.get('content-type') || '', /video\/mp4/);
assert.equal(Number(head.headers.get('content-length')), fs.statSync(mp4Path).size, 'HEAD content length must match source');
assert.match(head.headers.get('accept-ranges') || '', /bytes/);
assert.equal((await head.arrayBuffer()).byteLength,0,'HEAD has no body');
const headRange=await fetch(base+'/assets/login-smoke-ambient.mp4',{method:'HEAD',headers:{Range:'bytes=0-15'}});
assert.equal(headRange.status,200);assert.equal(headRange.headers.get('content-range'),null);
assert.equal(Number(headRange.headers.get('content-length')),fs.statSync(mp4Path).size);
assert.equal((await headRange.arrayBuffer()).byteLength,0);
const full = await get('/assets/login-smoke-ambient.mp4');
assert.equal(full.status, 200, 'MP4 full GET must be served');
const bytes = Buffer.from(await full.arrayBuffer());
assert.ok(bytes.length > 16, 'MP4 must be non-empty');
assert.deepEqual(bytes,fs.readFileSync(mp4Path),'HTTP full GET bytes match approved source');
const range = await get('/assets/login-smoke-ambient.mp4', { Range: 'bytes=0-15' });
assert.equal(range.status, 206, 'MP4 range GET must return partial content');
assert.match(range.headers.get('content-range') || '', /^bytes 0-15\//);
assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 16), 'open range bytes must match source');
const suffix = await get('/assets/login-smoke-ambient.mp4', { Range: 'bytes=-16' });
assert.equal(suffix.status, 206, 'MP4 suffix range must return partial content');
assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-16), 'suffix range bytes must match source');
for (const rangeHeader of ['bytes=0-15,20-30', 'bytes=15-0', 'bytes=-0', 'bytes=999999999999999999999-']) {
  const result = await get('/assets/login-smoke-ambient.mp4', { Range: rangeHeader });
  assert.equal(result.status,416,`invalid range ${rangeHeader} rejected`);
  assert.equal(result.headers.get('content-range'),`bytes */${bytes.length}`);
  assert.equal((await result.arrayBuffer()).byteLength,0);
}
for (const [header,start,end] of [['bytes=0-0',0,0],['bytes=16-',16,bytes.length-1],[`bytes=0-${bytes.length+10}`,0,bytes.length-1],[`bytes=-${bytes.length+10}`,0,bytes.length-1]]) {
  const result=await get('/assets/login-smoke-ambient.mp4',{Range:header});
  assert.equal(result.status,206);assert.equal(result.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
  assert.equal(Number(result.headers.get('content-length')),end-start+1);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes.subarray(start,end+1));
}
const malformed = await get('/assets/login-smoke-ambient.mp4', { Range: 'bytes=abc' });
assert.equal(malformed.status, 416, 'malformed range must be rejected');
const outOfBounds = await get('/assets/login-smoke-ambient.mp4', { Range: `bytes=${bytes.length + 10}-${bytes.length + 20}` });
assert.equal(outOfBounds.status, 416, 'out-of-bounds range must be rejected');
const poster = await get('/assets/login-smoke-ambient.png');
assert.equal(poster.status, 200, 'PNG fallback must be served');
assert.match(poster.headers.get('content-type') || '', /image\/png/);
console.log(`AUTH SMOKE ASSETS QA: PASS (source/dist parity, HTTP HEAD/GET/Range/suffix/malformed/out-of-bounds, PNG fallback; bytes=${bytes.length})`);

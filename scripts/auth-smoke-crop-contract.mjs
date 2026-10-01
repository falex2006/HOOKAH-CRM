import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const css = read('auth-smoke.css');
assert.match(css, /@media\(min-width:901px\)\{\.auth-smoke-video,\.auth-smoke-texture\{transform:scale\(1\.2\);transform-origin:50% 0\}\}/);
assert.match(css, /\.auth-smoke-backdrop\{[^}]*overflow:hidden;[^}]*pointer-events:none/);
assert.match(css, /\.auth-smoke-backdrop \*\{pointer-events:none\}/);
assert.match(css, /\.auth-smoke-video,\.auth-smoke-texture,.*\{position:absolute;inset:0;width:100%;height:100%/);
assert.match(css, /@media\(max-width:760px\)\{\.auth-smoke-video\{object-position:42% center\}/);
assert.equal(css, read('dist/auth-smoke.css'), 'source/dist auth-smoke CSS mismatch');
assert.match(read('lock.js'), /auth-smoke\.css\?rev=2/);
assert.equal(read('lock.js'), read('dist/lock.js'), 'source/dist lock.js mismatch');
assert.match(read('login.html'), /auth-smoke\.css\?rev=2/);
console.log('AUTH SMOKE CROP CONTRACT: PASS (desktop-only 1.2x crop, aligned layers, clipping, inert backdrop, source/dist parity)');

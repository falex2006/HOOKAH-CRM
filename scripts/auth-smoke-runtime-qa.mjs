import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../auth-smoke.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../auth-smoke.css', import.meta.url), 'utf8');
assert.match(source, /prefers-reduced-motion/);
assert.match(source, /document\.hidden/);
assert.match(source, /visibilitychange/);
assert.match(source, /video\.addEventListener\('error'/);
assert.match(source, /video\.addEventListener\('playing'/);
assert.match(source, /entry\.generation/);
assert.match(source, /if \(window\.__authSmokeController\) return/);
assert.match(source, /playing\.catch/);
assert.match(source, /motion\.addEventListener|motion\.addListener/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /video-fallback/);
assert.match(source, /if\s*\(!entry\.active\s*\|\|\s*motion\.matches\s*\|\|\s*document\.hidden\s*\|\|\s*entry\.failed\)/);

const classSet = () => {
  const values = new Set();
  return { add: (value) => values.add(value), remove: (value) => values.delete(value), contains: (value) => values.has(value), toggle: (value, force) => force === undefined ? (values.has(value) ? values.delete(value) : values.add(value)) : (force ? values.add(value) : values.delete(value)) };
};
const listeners = new Map();
const backdrop = {
  hidden: false, isConnected: true, classList: classSet(), parentElement: null,
  getAttribute: (name) => name === 'aria-hidden' ? 'false' : null,
  closest: (selector) => selector === '.login' ? backdrop : null,
  prepend(node) { this.video = node; },
};
const document = {
  hidden: false, documentElement: {},
  querySelectorAll: (selector) => selector === '.auth-smoke-backdrop' ? [backdrop] : [],
  createElement: () => {
    const video = { classList: classSet(), isConnected: true, paused: true, playCount: 0, pauseCount: 0, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, setAttribute() {}, play() { this.paused = false; this.playCount += 1; return Promise.resolve(); }, pause() { this.paused = true; this.pauseCount += 1; }, remove() { this.isConnected = false; } };
    return video;
  },
  addEventListener(name, fn) { listeners.set(name, fn); },
};
const observer = { observe() {} };
const context = {
  window: { __authSmokeController: null, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
  document, MutationObserver: function MutationObserver() { return observer; },
  setTimeout, clearTimeout, console,
};
vm.runInNewContext(source, context);
assert.ok(context.window.__authSmokeController, 'controller must mount once');
await Promise.resolve();
assert.ok(backdrop.video, 'visible backdrop creates a video');
assert.equal(backdrop.video.src, '/assets/login-smoke-ambient.mp4');
const video = backdrop.video;
assert.equal(video.playCount, 1, 'visible video starts once');
document.hidden = true; context.window.__authSmokeController.refresh();
assert.equal(video.pauseCount, 1, 'hidden document pauses video');
document.hidden = false; context.window.__authSmokeController.refresh();
assert.equal(video.playCount, 2, 'visibility restore resumes video');
video.listeners.error();
assert.equal(backdrop.classList.contains('video-fallback'), true, 'media error activates static fallback');
assert.equal(backdrop.classList.contains('video-ready'), false, 'failed media cannot remain ready');

// Reduced-motion is an executable scenario: no video node is created at all.
backdrop.video = null; backdrop.classList = classSet();
const reducedContext = { ...context, window: { ...context.window, __authSmokeController: null, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) } };
vm.runInNewContext(source, reducedContext);
assert.equal(backdrop.video, null, 'reduced-motion starts with static fallback and no video');

// A rejected play promise must converge to fallback without throwing or leaving
// a ready class behind.
backdrop.video = null; backdrop.classList = classSet();
let rejectedVideo;
const rejectDocument = { ...document, createElement: () => {
  rejectedVideo = { listeners: {}, isConnected: true, addEventListener(name, fn) { this.listeners[name] = fn; }, setAttribute() {}, play() { return Promise.reject(new Error('autoplay_denied')); }, pause() {}, remove() {} };
  return rejectedVideo;
} };
const rejectedContext = { ...context, document: rejectDocument, window: { ...context.window, __authSmokeController: null } };
vm.runInNewContext(source, rejectedContext);
await Promise.resolve(); await Promise.resolve();
assert.equal(backdrop.classList.contains('video-fallback'), true, 'rejected play uses static fallback');

// Re-running the bundle is idempotent, and repeated observer refreshes do not
// start another playback cycle once state is stable.
const controller = context.window.__authSmokeController;
const beforePlay = video.playCount;
vm.runInNewContext(source, context);
assert.equal(context.window.__authSmokeController, controller, 'controller mount is idempotent');
controller.refresh(); controller.refresh();
assert.equal(video.playCount, beforePlay, 'stable observer refresh does not replay video');
console.log('AUTH SMOKE RUNTIME QA: PASS (visibility/reduced-motion hooks, media error fallback, pause/resume, guarded controller mount and generation state)');

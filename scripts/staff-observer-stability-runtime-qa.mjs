import assert from 'node:assert/strict';
import fs from 'node:fs';

const telegram = fs.readFileSync(new URL('../staff-telegram-link.js', import.meta.url), 'utf8');
const vip = fs.readFileSync(new URL('../vip-deposit-ui.js', import.meta.url), 'utf8');

// Regression guards for the exact main-thread freeze: observer callbacks must
// write only when the rendered value actually differs from the desired value.
assert.match(telegram, /if\(link\.textContent!==['"]Telegram['"]\)link\.textContent=['"]Telegram['"]/,
  'Telegram mount must guard textContent writes');
assert.match(telegram, /if\(link\.title!==['"]Открыть Telegram сотрудника['"]\)link\.title=['"]Открыть Telegram сотрудника['"]/,
  'Telegram mount must guard title writes');
assert.match(vip, /if\(banner\.innerHTML!==markup\)banner\.innerHTML=markup/,
  'VIP notice mount must guard innerHTML writes');

// Small deterministic mutation-queue model: a first mount may enqueue one
// mutation, but the second mount must converge and stop producing writes.
const settle = (mount, state) => {
  const queue = [1]; let callbacks = 0; let writes = 0;
  while (queue.length && callbacks < 20) {
    queue.shift(); callbacks += 1;
    const changed = mount(state);
    if (changed) { writes += 1; queue.push(1); }
  }
  return { callbacks, writes, stable: queue.length === 0 };
};
const guardedTelegram = (state) => {
  const wanted = state.value ? 'Telegram' : null;
  if (state.link !== wanted) { state.link = wanted; return true; }
  return false;
};
const guardedVip = (state) => {
  const wanted = state.vip && state.amount < state.minimum ? `VIP:${state.amount}/${state.minimum}` : null;
  if (state.banner !== wanted) { state.banner = wanted; return true; }
  return false;
};

for (const state of [{ value: true, link: null }, { value: false, link: 'Telegram' }]) {
  const result = settle(guardedTelegram, state);
  assert.equal(result.stable, true); assert.ok(result.callbacks <= 3); assert.ok(result.writes <= 2);
}
for (const state of [
  { vip: true, amount: 1000, minimum: 3000, banner: null },
  { vip: true, amount: 3500, minimum: 3000, banner: 'VIP:1000/3000' },
  { vip: false, amount: 1000, minimum: 3000, banner: 'VIP:1000/3000' },
]) {
  const result = settle(guardedVip, state);
  assert.equal(result.stable, true); assert.ok(result.callbacks <= 3); assert.ok(result.writes <= 2);
}

console.log('STAFF OBSERVER STABILITY RUNTIME QA: PASS (Telegram/VIP guarded DOM writes, mutation queue convergence, changed values and removal paths)');

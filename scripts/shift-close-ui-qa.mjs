import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const apiStart = source.indexOf('const shiftApi=');
const messageStart = source.indexOf('const shiftCloseFailureMessage=', apiStart);
const refreshStart = source.indexOf('\nconst refreshShift=', messageStart);
assert.ok(apiStart >= 0 && messageStart > apiStart && refreshStart > messageStart, 'shift API and close error message helpers are available');

const apiSource = source.slice(apiStart, messageStart).trim();
const messageSource = source.slice(messageStart, refreshStart).trim();
assert.match(source, /\.catch\(\(error\)=>notice\(shiftCloseFailureMessage\(error\),8000\)\)/,
  'the shift-close action must show the specific server error message long enough to read');

const shiftApi = new Function('staticStaffDemo', 'localStorage', 'fetch', 'sessionHeaders', `${apiSource}; return shiftApi;`)(
  () => false,
  {},
  async () => ({ ok: false, status: 409, json: async () => ({ error: 'shift_cash_attribution_unresolved', count: 3, amount: 1234.5 }) }),
  () => ({ Authorization: 'Bearer qa' }),
);
const failureMessage = new Function(`${messageSource}; return shiftCloseFailureMessage;`)();

await assert.rejects(
  shiftApi({ url: '/api/shifts/shift-1/close', method: 'POST' }),
  (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'shift_cash_attribution_unresolved');
    assert.equal(error.payload.count, 3);
    assert.equal(error.payload.amount, 1234.5);
    const message = failureMessage(error);
    assert.match(message, /Смена осталась открытой/);
    assert.match(message, /3/);
    assert.match(message, /1.?234,5/);
    assert.match(message, /Попросите управляющего сверить/);
    return true;
  },
);

assert.equal(failureMessage({ code: 'shift_not_found_or_closed' }), 'Не удалось закрыть смену',
  'other close errors retain the existing generic message');
assert.equal(failureMessage(new Error('HTTP 409')), 'Не удалось закрыть смену',
  'errors without a valid JSON payload retain the existing generic message');

console.log('SHIFT CLOSE UI QA: PASS (JSON error parsing, actionable legacy-cash message, and fallback errors)');

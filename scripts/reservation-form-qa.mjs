import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const capture = portal.slice(portal.indexOf("document.addEventListener('submit'"), portal.indexOf('\n', portal.indexOf("document.addEventListener('submit'")));
assert.match(capture, /'reservation-form'/, 'reservation form must own its pending state');
const submitStart = portal.indexOf("document.querySelector('#reservation-form').addEventListener('submit'");
const submitEnd = portal.indexOf("  api('/api/reservations/guests')", submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart);
const submit = portal.slice(submitStart, submitEnd);
assert.match(submit, /if \(form\.dataset\.submitting === '1'\) return/, 'pending request blocks duplicate submit');
assert.match(submit, /submit\.disabled = true; submit\.textContent = 'Подтверждение…'/, 'pending state is visible');
assert.match(submit, /const controls = \[\.\.\.form\.querySelectorAll\('input, select, textarea'\)\]/, 'pending request locks draft fields');
assert.match(submit, /\.finally\(\(\) => \{ controls\.forEach\(\(\{ control, disabled \}\) => \{ control\.disabled = disabled; control\._customSelectRefresh\?\.\(\); \}\); form\.dataset\.submitting = '0'; if \(submit\) \{ submit\.disabled = false; submit\.textContent = 'Подтвердить бронь'; \} if \(reservationSaved\) loadTables\(\); \}\)/, 'request completion restores original field states before reloading tables');

const start = portal.indexOf("  api('/api/reservations/guests').then((data) => {", submitEnd);
const endMarker = '}).catch(() => {}); loadTables(); load();';
const end = portal.indexOf(endMarker, start) + endMarker.length;
assert.ok(start >= 0 && end > start);
const guest = { value: '' };
const phone = { value: '' };
const clientId = { value: '' };
const hint = { textContent: '' };
const list = { innerHTML: '' };
let onInput;
guest.addEventListener = (_event, callback) => { onInput = callback; };
const clients = [
  { id: 'a', name: 'Одинаковый', nickname: 'А', phoneNumbers: [{ number: '+70000000001' }] },
  { id: 'b', name: 'Одинаковый', nickname: 'А', phoneNumbers: [{ number: '+70000000002' }] },
  { id: 'c', name: 'Уникальный', nickname: '', phoneNumbers: [{ number: '+70000000003' }] },
  { id: 'd', name: 'Одинаковый — А · +70000000001 · №1', nickname: '', phoneNumbers: [] },
];
vm.runInNewContext(portal.slice(start, end), {
  api: () => Promise.resolve({ items: clients }),
  esc: (value) => String(value),
  loadTables: () => {},
  load: () => {},
  document: { querySelector: (selector) => ({ '#reservation-guests-list': list, '#reservation-guest': guest, '#reservation-phone': phone, '#reservation-client-id': clientId, '#reservation-guest-match-hint': hint })[selector] },
});
await new Promise((resolve) => setImmediate(resolve));
assert.match(list.innerHTML, /Одинаковый — А · \+70000000001 · №1/);
assert.match(list.innerHTML, /Одинаковый — А · \+70000000002 · №2/);
assert.match(list.innerHTML, /Одинаковый — А · \+70000000001 · №1 · №1/, 'generated value cannot collide with a literal guest name');

guest.value = 'Уникальный'; onInput();
assert.equal(clientId.value, 'c');
assert.equal(phone.value, '+70000000003');
guest.value = 'Разовый'; onInput();
assert.equal(clientId.value, '', 'one-off guest must not inherit previous client ID');
assert.equal(phone.value, '', 'one-off guest must not inherit autofilled phone');
guest.value = 'Одинаковый'; onInput();
assert.equal(clientId.value, '', 'ambiguous name must not bind an arbitrary client');
assert.match(hint.textContent, /Несколько гостей/);
guest.value = 'Одинаковый — А · +70000000002 · №2'; onInput();
assert.equal(clientId.value, 'b', 'unique list choice must disambiguate identical names and nicknames');
assert.equal(guest.value, 'Одинаковый', 'submitted guest name must not contain option disambiguator');
assert.equal(phone.value, '+70000000002');
guest.value = 'Одинаковый — А · +70000000001 · №1'; onInput();
assert.equal(clientId.value, 'd', 'literal name matching another generated choice must bind its own ID');
assert.equal(guest.value, clients[3].name);
phone.value = '+79998887766';
guest.value = 'Другой разовый'; onInput();
assert.equal(clientId.value, '');
assert.equal(phone.value, '+79998887766', 'manual phone edit must survive guest name edit');

const values = new Map();
for (const id of ['reservation-guest', 'reservation-client-id', 'reservation-phone', 'reservation-date', 'reservation-time', 'reservation-table', 'reservation-guests', 'reservation-deposit', 'reservation-notes']) values.set(`#${id}`, { value: '', disabled: id === 'reservation-table' });
values.set('#reservation-message', { textContent: '', className: '' });
const submitButton = { disabled: false, textContent: 'Подтвердить бронь' };
const form = { dataset: {}, querySelector: () => submitButton, querySelectorAll: () => [...values.values()].filter((item) => 'value' in item) };
let onSubmit;
vm.runInNewContext(submit, {
  document: { querySelector: (selector) => selector === '#reservation-form' ? { addEventListener: (_event, callback) => { onSubmit = callback; } } : values.get(selector) },
  api: () => Promise.reject({ payload: { error: 'invalid_guest_phone' } }),
  portalUser: { name: 'QA' },
  portalRole: ['owner'],
  money: (amount) => String(amount),
  localDateKey: () => '2026-09-29',
  loadTables: () => {},
  load: () => {},
});
onSubmit({ preventDefault() {}, target: form });
assert.equal(submitButton.disabled, true);
assert.equal(submitButton.textContent, 'Подтверждение…');
assert.equal(values.get('#reservation-guest').disabled, true);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(values.get('#reservation-message').textContent, 'Проверьте телефон гостя');
assert.equal(submitButton.disabled, false, 'API error must unlock without timer');
assert.equal(submitButton.textContent, 'Подтвердить бронь');
assert.equal(values.get('#reservation-guest').disabled, false, 'editable field must unlock after error');
assert.equal(values.get('#reservation-table').disabled, true, 'initially disabled table must stay disabled');

console.log('RESERVATION FORM QA: PASS (pending ownership, guest identity, autofill cleanup)');

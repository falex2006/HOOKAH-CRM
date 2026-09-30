import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const start = portal.indexOf("document.querySelector('#client-form').addEventListener('submit'");
const end = portal.indexOf(' }); load();', start);
assert.ok(start >= 0 && end > start, 'guest form handler exists');
const handler = `${portal.slice(start, end + 4)};`;

const fields = new Map();
for (const id of ['client-id', 'client-name', 'client-nickname', 'client-phone', 'client-telegram', 'client-tobacco', 'client-bowls', 'client-bar', 'client-allergies', 'client-notes', 'client-status']) {
  fields.set(`#${id}`, { value: '' });
}
fields.set('#client-editor-title', { textContent: 'Новый гость' });
fields.set('#client-message', { textContent: '', className: '' });
const button = { disabled: false, textContent: 'Сохранить карточку' };
const form = { dataset: { submitting: '0' }, querySelector: () => button };
const editor = { hidden: false };
let onSubmit;
const requests = [];
let loadCount = 0;
const document = {
  querySelector(selector) {
    if (selector === '#client-form') return { addEventListener: (_event, callback) => { onSubmit = callback; } };
    return fields.get(selector) || null;
  },
};
const context = vm.createContext({
  document,
  editor,
  form,
  button,
  pendingAvatarUrl: '',
  parseTags: () => [],
  load: () => { loadCount += 1; },
  api: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
});
vm.runInContext(`let editorSession = 0; let submitGeneration = 0; ${handler}
  globalThis.testSession = () => { editorSession += 1; submitGeneration += 1; form.dataset.submitting = '0'; button.disabled = false; button.textContent = 'Сохранить карточку'; };
`, context);

const submit = () => onSubmit({ preventDefault() {}, target: form });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

fields.get('#client-name').value = 'QA slow first';
submit();
assert.equal(button.disabled, true);
assert.equal(requests.length, 1);

context.testSession();
fields.get('#client-id').value = 'other-id';
fields.get('#client-name').value = 'QA other card';
fields.get('#client-editor-title').textContent = 'Карточка: QA other card';
submit();
assert.equal(requests.length, 2);
assert.equal(button.disabled, true);

requests[0].resolve({ id: 'old-id', name: 'QA slow first' });
await settle();
assert.equal(fields.get('#client-id').value, 'other-id', 'old response must not retarget new editor');
assert.equal(fields.get('#client-editor-title').textContent, 'Карточка: QA other card');
assert.equal(fields.get('#client-message').textContent, '', 'old success must not show in new editor');
assert.equal(button.disabled, true, 'old finally must not unlock new request');
assert.equal(loadCount, 1, 'old success still refreshes guest list');

requests[1].resolve({ id: 'other-id', name: 'QA other card' });
await settle();
assert.equal(button.disabled, false);
assert.equal(fields.get('#client-message').textContent, 'Карточка сохранена');
assert.equal(loadCount, 2);

fields.get('#client-message').textContent = '';
submit();
context.testSession();
fields.get('#client-id').value = 'third-id';
requests[2].reject({ payload: { error: 'invalid_telegram' } });
await settle();
assert.equal(fields.get('#client-message').textContent, '', 'old error must not show in new editor');
assert.equal(fields.get('#client-id').value, 'third-id');

console.log('CLIENT FORM RACE QA: PASS (stale success, active pending, stale error)');

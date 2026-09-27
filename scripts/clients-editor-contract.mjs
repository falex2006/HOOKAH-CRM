import assert from 'node:assert/strict';
import fs from 'node:fs';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const renderClients = portal.slice(portal.indexOf('function renderClients()'), portal.indexOf('function renderReservations()'));

assert.match(renderClients, /id="new-client" aria-controls="client-editor" aria-expanded="false"/,
  'new guest action must announce and control the hidden editor');
assert.match(renderClients, /id="client-editor" aria-labelledby="client-editor-title" hidden/,
  'the guest editor must start hidden so the guest list is primary');
assert.match(renderClients, /id="client-cancel"[^>]*aria-label="Закрыть карточку"[^>]*>Закрыть/,
  'the editor must provide an explicit close action');
assert.match(renderClients, /const openEditor = \(client, trigger = newClientButton\) => \{[\s\S]*?newClientButton\.setAttribute\('aria-expanded', 'true'\)[\s\S]*?client-name'\)\.focus/,
  'opening a guest editor must expose it, update aria state, and focus its first field');
assert.match(renderClients, /const closeEditor = \(\) => \{[\s\S]*?editor\.hidden = true[\s\S]*?newClientButton\.setAttribute\('aria-expanded', 'false'\)[\s\S]*?focusTarget\.focus/,
  'closing the editor must hide it, restore state, and return focus');
assert.match(renderClients, /aria-controls="client-editor" aria-expanded="\$\{String\(Boolean/,
  'guest cards must expose their relationship to the editor and selected state');
assert.match(css, /body\[data-page="clients"\] #client-editor\[hidden\]\{display:none!important\}/);
assert.match(css, /body\[data-page="clients"\] \.content-grid\{grid-template-columns:minmax\(0,1fr\)/,
  'initial desktop view must give the guest list the full width');
assert.match(css, /body\[data-page="clients"\] \.content-grid\.has-client-editor\{grid-template-columns:minmax\(0,1fr\) minmax\(340px,390px\)\}/,
  'desktop editor may use a side-by-side layout only after an explicit selection');
assert.match(css, /body\[data-page="clients"\] \.content-grid>#client-editor\{order:-1\}/,
  'when open on narrow screens, the editor must precede the list');

console.log('CLIENT EDITOR CONTRACT: PASS (on-demand editor, clear close, focus, and responsive list-first layout)');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const portal = readFileSync(new URL('portal.js', root), 'utf8');
const css = readFileSync(new URL('style.css', root), 'utf8');
const rules = readFileSync(new URL('VISUAL_PAGE_RULES.md', root), 'utf8');
const sitemap = readFileSync(new URL('SITE_TREE.md', root), 'utf8');
const start = portal.indexOf('function renderIntegrations() {');
const end = portal.indexOf('function renderNetwork() {', start);
assert.ok(start >= 0 && end > start, 'integration renderer exists');
const renderer = portal.slice(start, end);

assert.equal((renderer.match(/<section class="panel wide integrations-panel"/g) || []).length, 1,
  'integrations page must have one focused Telegram panel');
assert.match(renderer, /<h2>Telegram<\/h2>/, 'Telegram must be the single active integration');
assert.match(renderer, /id="telegram-integration-status"/, 'Telegram connection status must be visible');
assert.match(renderer, /id="telegram-integration-help"/, 'the page must explain what is available at the current integration stage');
assert.match(css, /integrations-panel \.integration-detail-grid\{grid-template-columns:minmax\(0,1fr\);/,
  'the one remaining integration detail must not leave an empty second column');
assert.match(renderer, /В разработке/, 'unavailable setup must be described honestly');
assert.match(renderer, /Статус недоступен/, 'API failure must have a distinct status');
assert.doesNotMatch(renderer, /Справочник табаков|Справочник крепкого алкоголя|Справочник пива|Справочник энергетиков/,
  'product directories must not be presented as active integrations');
assert.doesNotMatch(portal, /hookah_directory_activated|825422537|hookah-directory-activate/,
  'the removed client-side PIN activation must not remain in shipped source');
assert.match(rules, /единственная интеграция в текущем объёме/,
  'the visual page contract must preserve the currently approved Telegram-only scope');
assert.match(sitemap, /\/integrations.*сейчас Telegram/,
  'the site tree must explain the current integration scope');

console.log('INTEGRATIONS SCOPE CONTRACT: PASS (Telegram-only, honest status states, no fake PIN-gated integrations)');

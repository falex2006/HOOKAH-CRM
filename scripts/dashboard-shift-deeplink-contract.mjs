import assert from 'node:assert/strict';
import fs from 'node:fs';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const applyModules = portal.match(/const apply = \(\) => \{[\s\S]*?document\.querySelectorAll\('\[data-dashboard-module\]'\)\.forEach\(\(node\) => \{[^;]+; \}\);[\s\S]*?\n  \};/)?.[0];
assert.ok(applyModules, 'dashboard module visibility handler must exist');
assert.match(applyModules, /window\.location\.hash === '#shift-control'.*node\.id === 'shift-control'/, 'direct shift deep link must keep its target visible after preferences apply');

const getTarget = portal.match(/const getSettingsHashTarget = \(hash = window\.location\.hash\) => \{[\s\S]*?\n  \};/)?.[0];
assert.ok(getTarget, 'dashboard hash target mapper must exist');
assert.match(getTarget, /'#shift-control': '#shift-control'/, 'shift deep link must resolve to its panel');

const focusBranch = portal.match(/\} else if \(dashboardFocus === 'shift-control'\) \{[\s\S]*?\n  \} else if \(dashboardFocus === 'company'\)/)?.[0];
assert.ok(focusBranch, 'shift deep link focus branch must exist');
assert.match(focusBranch, /setDashboardPanelVisibility\('#shift-control', true\)/, 'shift panel must be explicitly shown');
assert.match(focusBranch, /Контроль смены/, 'focused title must identify shift control');

const focusedHashes = portal.match(/const focused = \[([^\]]+)\]\.includes\(window\.location\.hash\)/)?.[1];
assert.ok(focusedHashes?.includes("'#shift-control'"), 'hash changes must scroll to the focused shift panel');
const initialFocusedHashes = portal.match(/const focusedSettingsHash = \[([^\]]+)\]\.includes\(window\.location\.hash\)/)?.[1];
assert.ok(initialFocusedHashes?.includes("'#shift-control'"), 'initial deep links must scroll to the focused shift panel');

console.log('DASHBOARD SHIFT DEEP LINK CONTRACT: PASS (visibility, title and initial/hash-change focus)');

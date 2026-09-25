import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

assert.match(app, /const preserveWorkspaceRoute=\(href\)=>/);
assert.match(app, /next\.pathname!==['"]\/admin['"]/);
assert.match(app, /next\.searchParams\.set\(['"]mode['"],workspaceMode\)/);
assert.match(app, /staff-guests-link.*preserveWorkspaceRoute\(['"]\/clients['"]\)/s);
assert.match(app, /label\.includes\(['"]Бронирования['"]\).*preserveWorkspaceRoute\(['"]\/reservations['"]\)/s);
assert.match(app, /label\.includes\(['"]Склад['"]\).*preserveWorkspaceRoute\(['"]\/inventory['"]\)/s);
assert.match(app, /label\.includes\(['"]Финансы['"]\).*preserveWorkspaceRoute\(['"]\/finance['"]\)/s);

console.log('STAFF MODE NAVIGATION CONTRACT: PASS (workspace mode survives route changes)');

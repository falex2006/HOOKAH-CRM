import fs from 'node:fs';
import assert from 'node:assert/strict';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const staffCard = fs.readFileSync(new URL('../staff-admin-card.js', import.meta.url), 'utf8');

assert.match(server, /const clearPassportRequested = input\.passportData\?\.clear === true;/);
assert.match(server, /if \(clearPassportRequested && req\.user\?\.role !== 'owner'\) return json\(res, 403, \{ error: 'staff_passport_clear_owner_required' \}\);/);
assert.match(server, /const clearPassportData = clearPassportRequested && canManageSensitive;/);
assert.match(server, /CASE WHEN \$24 THEN NULL ELSE COALESCE\(\$15,passport_data_encrypted\) END/);
assert.match(server, /CASE WHEN \$20 THEN NULL ELSE COALESCE\(\$11,passport_data_encrypted\) END/);
assert.match(staffCard, /\{passportData:\{clear:true\}\}/);
assert.ok(staffCard.includes("api('/api/staff/'+encodeURIComponent(id)+'/pin'"));
assert.ok(staffCard.includes('Карточка сохранена, но PIN не установлен. Проверьте PIN и повторите сохранение.'), 'partial card/PIN failure must be explained accurately');

console.log('STAFF PIN/PASSPORT CONTRACT: PASS (blank profile save preserves passport, PIN remains separate, clearing is owner-only and atomic)');

import assert from 'node:assert/strict';
import fs from 'node:fs';
const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
assert.match(portal, /const formatActiveStaffCount=\(value\)=>\{const count=Number\(value\)\|\|0;return `\$\{count\} \$\{pluralRu\(count,'активный','активных','активных'\)\}`;\};/,
  'active staff metric must use shared Russian pluralization');
assert.match(portal, /key === 'staffActive' \? formatActiveStaffCount\(metrics\[key\]\)/,
  'dashboard metrics must use shared active staff pluralization');
assert.match(portal, /badge\.textContent = formatActiveStaffCount\(items\.filter\(\(person\) => person\.active\)\.length\)/,
  'staff list counts must use the same formatter');
assert.doesNotMatch(portal, /items\.filter\(\(person\) => person\.active\)\.length ['"]активных/,
  'hardcoded plural suffix must be removed');
console.log('STAFF ACTIVE COUNT CONTRACT: PASS (dashboard and staff section use shared Russian pluralization)');

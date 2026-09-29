import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const report = readFileSync(new URL('../HOOKAH_CRM_ADDITIONAL_ACCEPTANCE.md', import.meta.url), 'utf8');
const sectionStart = report.indexOf('## Матрица исходных пунктов');
const sectionEnd = report.indexOf('\n## Что блокирует заявление', sectionStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'the 50-point traceability section must exist');

const rows = report.slice(sectionStart, sectionEnd).split(/\r?\n/).filter(line => /^\|\s*\d+\s*\|/.test(line));
assert.equal(rows.length, 50, 'every one of the 50 original requirements must have its own row');
const numbers = rows.map((line, index) => {
  const columns = line.split('|').slice(1, -1).map(value => value.trim());
  assert.equal(columns.length, 5, `requirement row ${index + 1} must keep five traceability fields`);
  assert.equal(Number(columns[0]), index + 1, 'requirement numbering must remain exact and consecutive');
  assert.ok(columns.slice(1).every(Boolean), `requirement ${index + 1} must include requirement, status, implementation, and evidence`);
  assert.match(columns[2], /^(?:готово|частично|не реализовано|не проверено)(?:$|\s)/i, `requirement ${index + 1} must use a conservative recognized status`);
  return Number(columns[0]);
});
assert.deepEqual(numbers, Array.from({ length: 50 }, (_, index) => index + 1));
process.stdout.write('HOOKAH CRM ADDITIONAL ACCEPTANCE CONTRACT: PASS (50 separate, consecutively numbered requirements with conservative status and evidence)\n');

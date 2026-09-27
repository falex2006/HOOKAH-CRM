import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const report = readFileSync(new URL('../FINAL_ACCEPTANCE_REPORT.md', import.meta.url), 'utf8');
const sectionStart = report.indexOf('## Сверка с исходными 34 пунктами ТЗ');
const sectionEnd = report.indexOf('\n## Выпуск и следующий шаг', sectionStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'the current 34-item traceability section must exist');

const table = report.slice(sectionStart, sectionEnd);
const rows = table.split(/\r?\n/).filter(line => /^\|\s*\d+\s*\|/.test(line));
assert.equal(rows.length, 34, 'the report must have one row per original requirement');

const parsed = rows.map((line, index) => {
  const columns = line.split('|').slice(1, -1).map(value => value.trim());
  assert.equal(columns.length, 6, `requirement row ${index + 1} must keep six traceability fields`);
  const number = Number(columns[0]);
  assert.equal(number, index + 1, 'source requirement numbering must remain exact and consecutive');
  assert.ok(columns.slice(1).every(Boolean), `requirement row ${number} must name requirement, status, implementation, evidence, and risk`);
  assert.match(columns[2], /^(?:готово|частично|не реализовано|не проверено)(?:$|\s)/i, `requirement ${number} must use a conservative recognized status`);
  return number;
});

assert.deepEqual(parsed, Array.from({ length: 34 }, (_, index) => index + 1));
process.stdout.write('FINAL ACCEPTANCE MATRIX CONTRACT: PASS (34 distinct, correctly numbered requirements with evidence and residual risk)\n');

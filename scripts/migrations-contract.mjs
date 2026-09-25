import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const migrationDir = path.join(root, 'migrations');
const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
assert.ok(files.length > 0, 'migration directory must contain SQL migrations');

for (const file of files) {
  const source = fs.readFileSync(path.join(migrationDir, file), 'utf8');
  // CREATE TABLE and CREATE INDEX statements are expected to be replay-safe.
  for (const match of source.matchAll(/^\s*CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?!IF\s+NOT\s+EXISTS\b)/gim)) {
    assert.fail(`${file}: ${match[0].trim()} must use IF NOT EXISTS`);
  }
}

const expenses = fs.readFileSync(path.join(migrationDir, '022_expenses.sql'), 'utf8');
const capacity = fs.readFileSync(path.join(migrationDir, '024_table_capacity_range.sql'), 'utf8');
assert.match(expenses, /DO\s+\$\$[\s\S]*payroll_entries_expense_fk[\s\S]*END\s*\$\$;/, 'expense FK must be guarded');
assert.match(capacity, /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+tables_capacity_range_check[\s\S]*DO\s+\$\$[\s\S]*tables_capacity_range_check[\s\S]*END\s*\$\$;/, 'capacity constraint must be replay-safe');
assert.doesNotMatch(expenses, /^ALTER\s+TABLE\s+payroll_entries\s+ADD\s+CONSTRAINT/m, 'expense FK must not be added unconditionally');
assert.doesNotMatch(capacity, /^ALTER\s+TABLE\s+tables\s+ADD\s+CONSTRAINT/m, 'capacity constraint must not be added unconditionally');

const migrationRunner = fs.readFileSync(path.join(root, 'migrate-vps.sh'), 'utf8');
assert.match(migrationRunner, /migrations\/\*\.sql/);
assert.match(migrationRunner, /ON_ERROR_STOP=1/);
console.log(`MIGRATIONS CONTRACT: PASS (${files.length} replay-safe migration files)`);

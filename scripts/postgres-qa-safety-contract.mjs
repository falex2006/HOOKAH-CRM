import assert from 'node:assert/strict';
import { assertQaDatabaseIdentity, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

const local = validateQaDatabaseUrl('postgresql://qa:qa@127.0.0.1:55432/territory_qa', 'qa target');
assert.equal(local.database, 'territory_qa');
assert.equal(local.url.port, '55432');
assert.equal(validateQaDatabaseUrl('postgres://qa:qa@[::1]:5432/territory_test').database, 'territory_test');
assert.equal(validateQaDatabaseUrl('postgres://qa:qa@localhost:5432/territory_scratch').database, 'territory_scratch');

for (const value of [
  'postgres://qa:qa@192.168.1.25:5432/territory_qa',
  'postgres://qa:qa@qa.example.com:5432/territory_test',
  'postgres://qa:qa@127.0.0.1:5432/territory_qa?host=203.0.113.9',
  'postgres://qa:qa@127.0.0.1:5432/territory_qa?hostaddr=203.0.113.9',
  'postgres://qa:qa@127.0.0.1/territory_qa?port=5433',
  'postgres://qa:qa@127.0.0.1/territory_qa?dbname=production',
  'postgres://qa:qa@127.0.0.1:5432/territory',
  'https://qa:qa@127.0.0.1/territory_qa',
  'not a database url',
]) assert.throws(() => validateQaDatabaseUrl(value), undefined, `rejects unsafe target ${value}`);
assert.throws(() => validateQaDatabaseUrl(''), /required/);

const safeIdentity = { database: 'territory_qa', address: '127.0.0.1', port: 55432, superuser: true };
assert.doesNotThrow(() => assertQaDatabaseIdentity(safeIdentity, 'territory_qa', 55432));
assert.doesNotThrow(() => assertQaDatabaseIdentity({ ...safeIdentity, address: '::1' }, 'territory_qa', 55432));
assert.throws(() => assertQaDatabaseIdentity({ ...safeIdentity, database: 'production' }, 'territory_qa', 55432), /unexpected database/);
assert.throws(() => assertQaDatabaseIdentity({ ...safeIdentity, address: '10.0.0.5' }, 'territory_qa', 55432), /not loopback/);
assert.throws(() => assertQaDatabaseIdentity({ ...safeIdentity, port: 5432 }, 'territory_qa', 55432), /port does not match/);
assert.throws(() => assertQaDatabaseIdentity({ ...safeIdentity, superuser: false }, 'territory_qa', 55432), /QA superuser/);

console.log('POSTGRESQL QA SAFETY CONTRACT: PASS (loopback URL and server identity, dedicated QA database, superuser preflight)');

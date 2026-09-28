import assert from 'node:assert/strict';
import { assertQaDatabaseIdentity, isDisposableLoopbackQaContainer, validateQaDatabaseUrl } from './postgres-qa-safety.mjs';

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

const disposableContainer = {
  State: { Running: true },
  Config: { Image: 'postgres:16-alpine' },
  HostConfig: { AutoRemove: true },
  Mounts: [],
  NetworkSettings: {
    Networks: { bridge: { IPAddress: '172.17.0.2' } },
    Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }] },
  },
};
assert.equal(isDisposableLoopbackQaContainer(disposableContainer, '172.17.0.2/32', 5432, 55432), true);
assert.equal(isDisposableLoopbackQaContainer({ ...disposableContainer, HostConfig: { AutoRemove: false } }, '172.17.0.2/32', 5432, 55432), false);
assert.equal(isDisposableLoopbackQaContainer({ ...disposableContainer, Mounts: [{ Type: 'bind', Destination: '/var/lib/postgresql/data' }] }, '172.17.0.2/32', 5432, 55432), false);
assert.equal(isDisposableLoopbackQaContainer({ ...disposableContainer, NetworkSettings: { ...disposableContainer.NetworkSettings, Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55432' }] } } }, '172.17.0.2/32', 5432, 55432), false);

console.log('POSTGRESQL QA SAFETY CONTRACT: PASS (loopback URL/server identity and verified disposable localhost-only Docker container)');

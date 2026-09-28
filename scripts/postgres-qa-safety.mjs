import { spawnSync } from 'node:child_process';

const qaDatabaseName = /(?:test|qa|scratch)/i;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateQaDatabaseUrl(value, label = 'PostgreSQL QA URL') {
  if (!value) throw new Error(`${label} is required`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a valid PostgreSQL URL`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`${label} must use PostgreSQL`);
  if (!loopbackHosts.has(url.hostname.toLowerCase())) throw new Error(`${label} must connect to localhost/loopback only`);
  for (const override of ['host', 'hostaddr', 'port', 'database', 'dbname', 'service', 'servicefile']) {
    if (url.searchParams.has(override)) throw new Error(`${label} must not override PostgreSQL target via ${override}`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || !qaDatabaseName.test(database)) throw new Error(`${label} must name a dedicated test/QA/scratch database`);
  return { url, database };
}

export function assertQaDatabaseIdentity(identity, expectedDatabase, expectedPort, label = 'PostgreSQL QA target') {
  if (!identity || identity.database !== expectedDatabase) throw new Error(`${label} connected to an unexpected database`);
  const address = String(identity.address || '').toLowerCase();
  const loopbackAddress = address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
  const validPort = Number.isInteger(Number(identity.port)) && Number(identity.port) > 0;
  if (!loopbackAddress) {
    const containerName = process.env.MIGRATIONS_PG_TEST_DOCKER_CONTAINER;
    if (!containerName || !validPort || !assertLoopbackPublishedQaContainer(containerName, address, Number(identity.port), Number(expectedPort))) {
      throw new Error(`${label} server address is not loopback (set MIGRATIONS_PG_TEST_DOCKER_CONTAINER only for an explicitly verified, localhost-only disposable PostgreSQL container)`);
    }
  } else if (!validPort) throw new Error(`${label} server address is not loopback`);
  if (loopbackAddress && Number(identity.port) !== Number(expectedPort)) throw new Error(`${label} server port does not match its URL`);
  if (identity.superuser !== true) throw new Error(`${label} requires a dedicated local QA superuser role for test cleanup`);
}

function assertLoopbackPublishedQaContainer(containerName, address, internalPort, expectedHostPort) {
  const inspection = spawnSync('docker', ['inspect', containerName], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
  if (inspection.error || inspection.status !== 0) return false;
  let containers;
  try { containers = JSON.parse(inspection.stdout); } catch { return false; }
  const container = containers[0];
  return isDisposableLoopbackQaContainer(container, address, internalPort, expectedHostPort);
}

export function isDisposableLoopbackQaContainer(container, address, internalPort, expectedHostPort) {
  if (!container?.State?.Running || !String(container.Config?.Image || '').startsWith('postgres:')) return false;
  if (container.HostConfig?.AutoRemove !== true) return false;
  const mounts = container.Mounts || [];
  const disposableDataVolume = container.HostConfig?.AutoRemove === true && mounts.length === 1
    && mounts[0].Type === 'volume' && /^[a-f0-9]{64}$/i.test(String(mounts[0].Name || ''))
    && mounts[0].Destination === '/var/lib/postgresql/data';
  if (mounts.length !== 0 && !disposableDataVolume) return false;
  const containerIp = Object.values(container.NetworkSettings?.Networks || {}).map((network) => String(network.IPAddress || '').toLowerCase()).find(Boolean);
  const serverIp = address.replace(/\/\d+$/, '');
  if (!containerIp || containerIp !== serverIp || internalPort !== 5432) return false;
  const bindings = container.NetworkSettings?.Ports?.['5432/tcp'] || [];
  return bindings.some((binding) => ['127.0.0.1', '::1'].includes(String(binding.HostIp || '').toLowerCase()) && Number(binding.HostPort) === expectedHostPort);
}

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
  if (!loopbackAddress || !Number.isInteger(Number(identity.port)) || Number(identity.port) < 1) throw new Error(`${label} server address is not loopback`);
  if (Number(identity.port) !== Number(expectedPort)) throw new Error(`${label} server port does not match its URL`);
  if (identity.superuser !== true) throw new Error(`${label} requires a dedicated local QA superuser role for test cleanup`);
}

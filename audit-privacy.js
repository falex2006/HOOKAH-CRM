'use strict';

// Audit keeps the operation and ordinary business fields, never credentials or
// personnel documents. Apply on both write and read to protect older events.
const sensitiveAuditKey = (key) => {
  const name = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return name.startsWith('passport') || name.includes('password')
    || ['pin','pincode','pinhash','pindataencrypted','pindataiv','pindatatag',
      'token','tokenhash','accesstoken','refreshtoken','apitoken','sessiontoken','apikey','bottoken',
      'cookie','cookies','setcookie','authorization','proxyauthorization',
      'secret','sessionsecret','credentials'].includes(name);
};

function redactAuditData(value, ancestors = new Set(), depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 32 || ancestors.has(value)) return null;
  if (value instanceof Date) return value.toISOString();
  const next = new Set(ancestors); next.add(value);
  if (Array.isArray(value)) return value.map(item => redactAuditData(item, next, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveAuditKey(key))
    .map(([key, item]) => [key, redactAuditData(item, next, depth + 1)]));
}

const sanitizeAuditEvent = (event) => ({ ...event,
  beforeData: redactAuditData(event.beforeData ?? null),
  afterData: redactAuditData(event.afterData ?? null)
});

module.exports = { redactAuditData, sanitizeAuditEvent };

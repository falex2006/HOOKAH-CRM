const base = process.argv[2] || 'http://localhost:3000';
const target = new URL(base);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) throw new Error(`Local-only role test refused non-local BaseUrl: ${base}`);

const roles = {
  bartender: { required: ['floor', 'orders'], forbidden: ['finance', 'inventory'] },
  hookah_master: { required: ['floor', 'orders'], forbidden: ['finance', 'inventory'] },
  admin: { required: ['floor', 'orders', 'finance', 'inventory', 'staff_manage'], forbidden: [] },
  owner: { required: ['floor', 'orders', 'finance', 'inventory', 'staff_sensitive'], forbidden: [] },
  developer: { required: ['floor', 'orders', 'finance_read', 'inventory_read', 'diagnostics'], forbidden: ['finance', 'inventory'] }
};
for (const [role, expectation] of Object.entries(roles)) {
  const response = await fetch(`${base}/api/session?role=${encodeURIComponent(role)}`);
  if (!response.ok) throw new Error(`Session failed for ${role}: ${response.status}`);
  const payload = await response.json();
  const permissions = new Set(payload.permissions || []);
  for (const permission of expectation.required) if (!permissions.has(permission)) throw new Error(`${role} is missing ${permission}`);
  for (const permission of expectation.forbidden) if (permissions.has(permission)) throw new Error(`${role} has forbidden ${permission}`);
}
console.log(`LOCAL ROLE CONTRACT: PASS (${Object.keys(roles).length} roles)`);

import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const required = [
  'const identityKey = String(portalUser.id || portalUser.login || portalUser.name || roleKey)',
  'const storageKey = `crm_insights_user_${identityKey}`',
  'const legacyStorageKey = `crm_insights_${roleKey}`',
  'if (!stored && legacy) localStorage.setItem(storageKey, JSON.stringify(visible));'
];
for (const fragment of required) if (!source.includes(fragment)) throw new Error(`missing per-user insights fragment: ${fragment}`);
console.log('LOCAL INSIGHTS CONTRACT: PASS (per-user preferences with legacy migration)');

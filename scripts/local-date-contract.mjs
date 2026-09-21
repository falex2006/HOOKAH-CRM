import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
for (const fragment of ['const localDateKey = (value = new Date())', 'value="${localDateKey()}"', 'localDateKey(order.closedAt || order.createdAt)']) {
  if (!source.includes(fragment)) throw new Error(`missing local date fragment: ${fragment}`);
}
if (source.includes('new Date().toISOString().slice(0, 10)')) throw new Error('UTC date default remains in portal.js');
console.log('LOCAL DATE CONTRACT: PASS (local date defaults and filtering)');

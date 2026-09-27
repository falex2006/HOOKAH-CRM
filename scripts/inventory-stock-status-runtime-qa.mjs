const base = process.argv[2] || 'http://localhost:3000';
const target = new URL(base);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) throw new Error(`Local-only inventory QA refused non-local BaseUrl: ${base}`);
const request = (path, options = {}) => fetch(new URL(path, target), {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
});
const readJson = async (response) => {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return payload;
};
const beforeMetrics = await readJson(await request('/api/metrics'));
const created = await readJson(await request('/api/inventory/items', {
  method: 'POST',
  body: JSON.stringify({ name: `Контроль выключен QA ${Date.now()}`, unit: 'шт', itemType: 'ingredient', cost: 0, minLevel: 0 }),
}));
try {
  const inventory = await readJson(await request('/api/inventory'));
  const metrics = await readJson(await request('/api/metrics'));
  if ((inventory.lowStock || []).some((item) => item.id === created.id)) throw new Error('minLevel=0 unexpectedly appears in /api/inventory.lowStock');
  if (metrics.lowStock !== beforeMetrics.lowStock) throw new Error(`minLevel=0 changed dashboard low-stock metric: ${beforeMetrics.lowStock} -> ${metrics.lowStock}`);
} finally {
  const response = await request(`/api/inventory/items/${encodeURIComponent(created.id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`failed to clean up runtime QA item: ${response.status} ${await response.text()}`);
}
console.log('INVENTORY STOCK STATUS RUNTIME QA: PASS (disabled monitoring is excluded from inventory list and dashboard KPI)');

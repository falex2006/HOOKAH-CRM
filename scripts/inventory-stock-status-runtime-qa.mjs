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
const qaSuffix = Date.now();
const department = await readJson(await request('/api/inventory/departments', { method: 'POST', body: JSON.stringify({ code: `qa-stock-${qaSuffix}`, name: `QA stock ${qaSuffix}` }) }));
const created = await readJson(await request('/api/inventory/items', {
  method: 'POST',
  body: JSON.stringify({ name: `Контроль выключен QA ${qaSuffix}`, unit: 'шт', department: department.code, itemType: 'ingredient', cost: 0, minLevel: 0 }),
}));
let tracked;
try {
  tracked = await readJson(await request('/api/inventory/items', {
    method: 'POST',
    body: JSON.stringify({ name: `Контроль порога QA ${qaSuffix}`, unit: 'шт', department: department.code, itemType: 'ingredient', cost: 0, minLevel: 2 }),
  }));
  const inventory = await readJson(await request('/api/inventory'));
  const metrics = await readJson(await request('/api/metrics'));
  if ((inventory.lowStock || []).some((item) => item.id === created.id)) throw new Error('minLevel=0 unexpectedly appears in /api/inventory.lowStock');
  if (!(inventory.lowStock || []).some((item) => item.id === tracked.id)) throw new Error('positive minimum with zero stock is missing from /api/inventory.lowStock');
  if (metrics.lowStock !== beforeMetrics.lowStock + 1) throw new Error(`expected only the tracked stock item to increase the dashboard KPI: ${beforeMetrics.lowStock} -> ${metrics.lowStock}`);
  await readJson(await request('/api/inventory/movements', { method: 'POST', body: JSON.stringify({ itemId: tracked.id, delta: 3, unit: 'шт', reason: 'QA stock threshold' }) }));
  const restocked = await readJson(await request('/api/inventory'));
  const restockedMetrics = await readJson(await request('/api/metrics'));
  if ((restocked.lowStock || []).some((item) => item.id === tracked.id)) throw new Error('stock at minimum should leave the low-stock list');
  if (restockedMetrics.lowStock !== beforeMetrics.lowStock) throw new Error(`stock movement did not refresh dashboard low-stock KPI: ${beforeMetrics.lowStock} -> ${restockedMetrics.lowStock}`);
} finally {
  if (tracked) {
    const currentInventory = await readJson(await request('/api/inventory'));
    const currentTracked = (currentInventory.items || []).find((item) => item.id === tracked.id);
    if (Number(currentTracked?.onHand || 0) > 0) await readJson(await request('/api/inventory/movements', { method: 'POST', body: JSON.stringify({ itemId: tracked.id, delta: -Number(currentTracked.onHand), unit: tracked.unit || 'шт', reason: 'QA cleanup' }) }));
  }
  for (const item of [created, tracked].filter(Boolean)) {
    const response = await request(`/api/inventory/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`failed to clean up runtime QA item: ${response.status} ${await response.text()}`);
  }
  const departmentResponse = await request(`/api/inventory/departments/${encodeURIComponent(department.code)}`, { method: 'DELETE' });
  if (!departmentResponse.ok) throw new Error(`failed to clean up runtime QA department: ${departmentResponse.status} ${await departmentResponse.text()}`);
}
console.log('INVENTORY STOCK STATUS RUNTIME QA: PASS (disabled monitoring, below-minimum tracking, stock movement and dashboard KPI refresh)');

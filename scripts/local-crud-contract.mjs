const base = process.argv[2] || 'http://localhost:3000';
const target = new URL(base);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
  throw new Error(`Local-only contract test refused non-local BaseUrl: ${base}`);
}

const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, target), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) { payload = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};
const body = (value) => JSON.stringify(value);
const suffix = Date.now();

const category = await request('/api/product-categories', { method: 'POST', body: body({ name: `Локальная проверка ${suffix}` }) });
const product = await request('/api/products', { method: 'POST', body: body({ name: `Локальная позиция ${suffix}`, category: category.name, price: 123, aliases: ['проверка', 'test'], imageUrl: 'data:image/png;base64,AA==' }) });
await request(`/api/products/${product.id}`, { method: 'PATCH', body: body({ price: 130, aliases: ['обновлённая позиция'] }) });
await request(`/api/products/${product.id}/image`, { method: 'POST', body: body({ imageData: 'data:image/png;base64,AA==' }) });

const inventory = await request('/api/inventory');
const inventoryItem = inventory.items?.[0];
if (!inventoryItem) throw new Error('Inventory contract has no test item');
await request('/api/inventory/movements', { method: 'POST', body: body({ itemId: inventoryItem.id, delta: 1, reason: 'Локальная проверка' }) });

const financeCategory = await request('/api/finance/categories', { method: 'POST', body: body({ name: `Локальная категория ${suffix}`, kind: 'expense' }) });
await request(`/api/finance/categories/${financeCategory.id}`, { method: 'PATCH', body: body({ name: `Обновлённая категория ${suffix}` }) });

const floor = await request('/api/floor');
const table = floor.zones?.flatMap((zone) => zone.tables || []).find((entry) => !String(entry.id).includes('vip'));
if (!table) throw new Error('Floor contract has no regular table');
const reservation = await request('/api/reservations', { method: 'POST', body: body({ guestName: `Локальный гость ${suffix}`, phone: '+79990001122', date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '22:00', tableId: table.id, guests: 2, deposit: 0, notes: 'Локальная проверка' }) });
await request(`/api/reservations/${reservation.id}/cancel`, { method: 'POST', body: '{}' });

const delivery = await request('/api/deliveries', { method: 'POST', body: body({ customerName: `Локальная доставка ${suffix}`, phone: '+79990001123', address: 'Тестовый адрес', total: 500 }) });
await request(`/api/deliveries/${delivery.id}`, { method: 'PATCH', body: body({ status: 'in_delivery' }) });

await request(`/api/products/${product.id}`, { method: 'DELETE' });
await request(`/api/product-categories/${category.id}`, { method: 'DELETE' });
console.log(`LOCAL CRUD CONTRACT: PASS (product=${product.id}, inventory=${inventoryItem.id}, finance=${financeCategory.id}, reservation=${reservation.id}, delivery=${delivery.id})`);

const base = process.argv[2] || 'http://localhost:3000';
const target = new URL(base);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) throw new Error(`Local-only floor contract refused non-local BaseUrl: ${base}`);
const body = (value) => JSON.stringify(value);
const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, target), { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};
const raw = async (path, options = {}) => {
  const response = await fetch(new URL(path, target), { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
};
const suffix = Date.now();
const zone = await request('/api/floor/zones', { method: 'POST', body: body({ name: `Тестовый этаж ${suffix}` }) });
if (!zone.id || zone.name !== `Тестовый этаж ${suffix}`) throw new Error('Zone creation returned incomplete data');
const room = await request('/api/floor/tables', { method: 'POST', body: body({ zoneId: zone.id, name: `VIP-комната тест ${suffix}`, capacity: 8, minimumOrderTotal: 3500 }) });
if (!room.id || Number(room.capacity) !== 8 || Number(room.minimumOrderTotal) !== 3500) throw new Error('Room creation returned incomplete data');
const updated = await request(`/api/floor/tables/${encodeURIComponent(room.id)}`, { method: 'PATCH', body: body({ name: `VIP-комната обновлена ${suffix}`, capacity: 10, minimumOrderTotal: 4000 }) });
if (updated.name !== `VIP-комната обновлена ${suffix}` || Number(updated.capacity) !== 10 || Number(updated.minimumOrderTotal) !== 4000) throw new Error('Room update returned incomplete data');
const protectedZone = await raw(`/api/floor/zones/${encodeURIComponent(zone.id)}`, { method: 'DELETE' });
if (protectedZone.status !== 409 || protectedZone.payload?.error !== 'zone_not_empty') throw new Error('Non-empty zone deletion was not protected');
await request(`/api/floor/tables/${encodeURIComponent(room.id)}`, { method: 'DELETE' });
await request(`/api/floor/zones/${encodeURIComponent(zone.id)}`, { method: 'DELETE' });
const floor = await request('/api/floor');
if ((floor.zones || []).some((entry) => entry.id === zone.id)) throw new Error('Deleted zone remains in floor response');
console.log(`LOCAL FLOOR MANAGEMENT CONTRACT: PASS (zone=${zone.id}, room=${room.id})`);

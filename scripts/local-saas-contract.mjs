const base = process.argv[2] || 'http://localhost:3000';
const target = new URL(base);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) throw new Error(`Local-only SaaS contract refused: ${base}`);
const response = await fetch(new URL('/api/saas/account', target));
const payload = await response.json();
if (!response.ok) throw new Error(`SaaS account endpoint failed: ${response.status} ${JSON.stringify(payload)}`);
for (const key of ['id', 'name', 'slug', 'plan', 'subscriptionStatus', 'seatsLimit', 'venuesLimit', 'activeSeats', 'activeVenues']) {
  if (payload[key] === undefined || payload[key] === null) throw new Error(`SaaS account response misses ${key}`);
}
if (!Number.isInteger(Number(payload.seatsLimit)) || Number(payload.seatsLimit) < 1) throw new Error('Invalid SaaS seats limit');
if (!Number.isInteger(Number(payload.venuesLimit)) || Number(payload.venuesLimit) < 1) throw new Error('Invalid SaaS venues limit');
if (Number(payload.activeSeats) > Number(payload.seatsLimit) || Number(payload.activeVenues) > Number(payload.venuesLimit)) throw new Error('SaaS usage exceeds configured limits');
console.log(`LOCAL SAAS CONTRACT: PASS (plan=${payload.plan}, seats=${payload.activeSeats}/${payload.seatsLimit}, venues=${payload.activeVenues}/${payload.venuesLimit})`);

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRepositories } = require('./db');
const scryptAsync = require('util').promisify(crypto.scrypt);

const root = __dirname;
const repositories = createRepositories();
const orderRepository = repositories?.orders || null;
const sessionRepository = repositories?.sessions || null;
const venueDbId = process.env.VENUE_ID || '00000000-0000-0000-0000-000000000001';
const venue = {
  id: 'venue-territory', name: 'Территория', format: 'кальян-бар', city: 'Тюмень',
  address: 'ул. Пермякова, 77, этаж -1', phone: '+7 (996) 641-95-10', logoUrl: null,
  timezone: 'Asia/Yekaterinburg', vipRoomMinimums: { vip_room_1: 1500, vip_room_2: 2500 }
};
const integrations = {
  egais: { enabled: false, status: 'planned' },
  chestnyZnak: { enabled: false, status: 'planned' },
  kkt: { enabled: false, status: 'planned' },
  ofd: { enabled: false, status: 'planned' }
};
const products = [
  { id: 'hookah-darkside', name: 'Кальян — Darkside Blueberry', price: 1200, station: 'hookah', aliases: ['кальян', 'darkside', 'blueberry'], imageUrl: null },
  { id: 'lemonade-maracuya', name: 'Лимонад Маракуйя', price: 300, station: 'bar', aliases: ['лимонад', 'маракуйя', 'maracuya'], imageUrl: null },
  { id: 'redbull', name: 'Red Bull', price: 250, station: 'bar', aliases: ['red bull', 'ред булл', 'энергетик'], imageUrl: null },
  { id: 'tea-earl-grey', name: 'Чай Эрл Грей', price: 300, station: 'bar', aliases: ['чай', 'earl grey'], imageUrl: null },
  { id: 'clay-bowl', name: 'Чаша глиняная', price: 500, station: 'hookah', aliases: ['чаша'], imageUrl: null },
  { id: 'coco-nara', name: 'Уголь Coco Nara', price: 600, station: 'hookah', aliases: ['уголь', 'coco nara'], imageUrl: null }
];
const floor = [
  { id: 'hall', name: 'Зал', tables: Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return { id: `table-${n}`, name: `Стол ${n}`, status: n === 8 || [2, 6, 11].includes(n) ? 'occupied' : [4, 9].includes(n) ? 'reserved' : 'free' };
  }) },
  { id: 'vip', name: 'VIP-комнаты', tables: [
    { id: 'vip-room-1', name: 'VIP-комната 1', status: 'free', minimumOrderTotal: 1500 },
    { id: 'vip-room-2', name: 'VIP-комната 2', status: 'free', minimumOrderTotal: 2500 }
  ] }
];
const orders = [];
const discountRequests = [];
const staff = [
  { id: 'u-owner', name: 'Владелец', role: 'owner', active: true, avatarUrl: null },
  { id: 'u-maria', name: 'Мария', role: 'bartender', active: true, avatarUrl: null }
];
const inventory = [
  { id: 'ing-redbull', name: 'Red Bull', category: 'Холодильник', unit: 'шт', onHand: 24, minLevel: 10 },
  { id: 'ing-coco', name: 'Уголь Coco Nara', category: 'Кальянная зона', unit: 'уп', onHand: 8, minLevel: 5 },
  { id: 'ing-mint', name: 'Мята', category: 'Бар', unit: 'кг', onHand: 1.8, minLevel: 2 },
  { id: 'ing-lime', name: 'Лайм', category: 'Бар', unit: 'кг', onHand: 3.2, minLevel: 1 },
  { id: 'ing-bowl', name: 'Чаша глиняная', category: 'Кальянная зона', unit: 'шт', onHand: 14, minLevel: 4 }
];
const stockMovements = [];
const reservations = [];
const auditEvents = [];
const sessions = new Map();
const shifts = [];
const demoAccounts = [
  { username: 'admin', password: process.env.DEMO_ADMIN_PASSWORD || 'admin', name: 'Администратор', role: 'admin' },
  { username: 'owner', password: process.env.DEMO_OWNER_PASSWORD || 'demo', name: 'Владелец', role: 'owner' },
  { username: 'staff', password: process.env.DEMO_STAFF_PASSWORD || 'demo', name: 'Мария', role: 'bartender' }
];

const hashPassword = async (password) => { const salt = crypto.randomBytes(16).toString('hex'); const derived = await scryptAsync(String(password), salt, 64); return `scrypt$${salt}$${derived.toString('hex')}`; };
const verifyPassword = async (password, stored) => {
  if (!stored) return false;
  if (!String(stored).startsWith('scrypt$')) { const actual = Buffer.from(String(password)); const expectedPlain = Buffer.from(String(stored)); return actual.length === expectedPlain.length && crypto.timingSafeEqual(actual, expectedPlain); }
  const [, salt, encoded] = String(stored).split('$'); const derived = await scryptAsync(String(password), salt, 64); const expected = Buffer.from(encoded || '', 'hex'); return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
};

const rolePermissions = {
  owner: ['floor', 'orders', 'reservations', 'inventory', 'finance', 'staff', 'settings'],
  admin: ['floor', 'orders', 'reservations', 'inventory', 'finance'],
  senior_bartender: ['floor', 'orders', 'reservations', 'bar_tasks'],
  senior_hookah_master: ['floor', 'orders', 'reservations', 'hookah_tasks'],
  bartender: ['floor', 'orders', 'bar_tasks'],
  hookah_master: ['floor', 'orders', 'hookah_tasks'],
  developer: ['floor', 'diagnostics', 'finance_read', 'inventory_read']
};

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
};
const body = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
});
const orderTotal = (order) => order.items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
const vipSummary = (order) => {
  const minimum = Number(order.minimumOrderTotal || 0);
  const total = orderTotal(order);
  return { orderId: order.id, total, minimum, shortfall: Math.max(0, minimum - total), minimumApplied: minimum > 0 };
};
const today = () => new Date().toISOString().slice(0, 10);
const metrics = () => ({
  openOrders: orders.filter((order) => order.status === 'open').length,
  closedOrders: orders.filter((order) => order.status === 'closed').length,
  discountRequests: discountRequests.filter((request) => request.status === 'requested').length,
  staffActive: staff.filter((person) => person.active).length,
  reservationsToday: reservations.filter((reservation) => reservation.date === today()).length,
  lowStock: inventory.filter((item) => item.onHand <= item.minLevel).length
});
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const sessionFromRequest = async (req) => {
  const header = req.headers.authorization || '';
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2));
  const token = header.startsWith('Bearer ') ? header.slice(7) : (cookies.crm_session || '');
  if (!token) return null;
  const memorySession = sessions.get(token);
  if (memorySession) return memorySession;
  if (sessionRepository) { try { const persisted = await sessionRepository.get(hashToken(token)); if (persisted) return { user: { id: persisted.userId, name: persisted.name, role: persisted.role } }; } catch (_) {} }
  return null;
};
const recordAudit = (req, action, entityType, entityId, beforeData, afterData) => {
  const event = { id: `audit-${Date.now()}-${auditEvents.length}`, action, entityType, entityId: entityId || null, actor: req.user?.name || 'demo', beforeData: beforeData || null, afterData: afterData || null, createdAt: new Date().toISOString() };
  auditEvents.push(event);
  if (repositories?.audit) repositories.audit.record({ venueId: venueDbId, actorId: /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : null, action, entityType, entityId: /^[0-9a-f-]{36}$/i.test(entityId || '') ? entityId : null, beforeData, afterData }).catch(() => {});
};
const validImageData = (value) => /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(value || '')) && String(value).length <= 2_000_000;
const hasPermission = (req, permission) => process.env.AUTH_REQUIRED !== 'true' || Boolean(req.user && (rolePermissions[req.user.role] || []).includes(permission));
const denyUnless = (req, res, permission) => { if (hasPermission(req, permission)) return false; json(res, 403, { error: 'forbidden', permission }); return true; };
const denyUnlessAny = (req, res, permissions) => { if (permissions.some((permission) => hasPermission(req, permission))) return false; json(res, 403, { error: 'forbidden', permission: permissions.join(' or ') }); return true; };

async function api(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (pathname === '/api/login' && req.method === 'POST') {
    const input = await body(req);
    let account = demoAccounts.find((entry) => entry.username === input.username && entry.password === input.password);
    if (!account) { const person = staff.find((entry) => entry.active && entry.login === input.username); if (person && await verifyPassword(input.password, person.passwordHash)) account = { username: person.login, id: person.id, name: person.name, role: person.role }; }
    if (!account && repositories?.pool) {
      try { const { rows } = await repositories.pool.query('SELECT id,login,full_name AS name,role,pin_hash FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username]); const row = rows[0]; if (row && await verifyPassword(input.password, row.pin_hash)) account = { username: row.login, id: row.id, name: row.name, role: row.role }; } catch (_) {}
    }
    if (!account) return json(res, 401, { error: 'invalid_credentials' });
    const token = crypto.randomBytes(32).toString('hex');
    const userId = account.id || (account.username === 'owner' ? '20000000-0000-0000-0000-000000000001' : '20000000-0000-0000-0000-000000000002');
    sessions.set(token, { user: { id: userId, name: account.name, role: account.role }, createdAt: Date.now() });
    if (sessionRepository) { try { await sessionRepository.create({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 28_800_000).toISOString() }); } catch (_) {} }
    res.setHeader('Set-Cookie', `crm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
    return json(res, 200, { token, user: { name: account.name, role: account.role }, expiresIn: 28800 });
  }
  if (pathname === '/api/logout' && req.method === 'POST') { const header = req.headers.authorization || ''; const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2)); const token = header.startsWith('Bearer ') ? header.slice(7) : (cookies.crm_session || ''); if (token && sessionRepository) sessionRepository.remove(hashToken(token)).catch(() => {}); sessions.delete(token); res.setHeader('Set-Cookie', 'crm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  if (process.env.AUTH_REQUIRED === 'true' && pathname !== '/api/health' && pathname !== '/api/login') {
    const session = await sessionFromRequest(req);
    if (!session) return json(res, 401, { error: 'authentication_required' });
    req.user = session.user;
  }
  if (pathname === '/api/health') return json(res, 200, { status: 'ok', service: 'hookah-crm' });
  if (pathname === '/api/shifts' && req.method === 'GET') {
    if (denyUnlessAny(req, res, ['floor', 'orders'])) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT id,opened_at AS "openedAt",closed_at AS "closedAt",opening_cash AS "openingCash",closing_cash AS "closingCash" FROM shifts WHERE venue_id=$1 ORDER BY opened_at DESC LIMIT 20', [venueDbId]); return json(res, 200, { items: rows, current: rows.find((entry) => !entry.closedAt) || null }); } catch (_) {} }
    return json(res, 200, { items: shifts.slice().reverse(), current: shifts.find((entry) => !entry.closedAt) || null });
  }
  if (pathname === '/api/shifts' && req.method === 'POST') {
    if (denyUnlessAny(req, res, ['floor', 'orders'])) return;
    const input = await body(req);
    if (repositories?.pool) { try { const open = await repositories.pool.query('SELECT id FROM shifts WHERE venue_id=$1 AND closed_at IS NULL LIMIT 1', [venueDbId]); if (open.rows[0]) return json(res, 409, { error: 'shift_already_open' }); const openedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001'; const { rows } = await repositories.pool.query('INSERT INTO shifts (venue_id,opened_by,opening_cash) VALUES ($1,$2,$3) RETURNING id,opened_at AS "openedAt",closed_at AS "closedAt",opening_cash AS "openingCash",closing_cash AS "closingCash"', [venueDbId, openedBy, Number(input.openingCash || 0)]); recordAudit(req, 'shift.opened', 'shift', rows[0].id, null, rows[0]); return json(res, 201, rows[0]); } catch (error) { return json(res, 409, { error: 'shift_open_failed', detail: error.message }); } }
    if (shifts.some((entry) => !entry.closedAt)) return json(res, 409, { error: 'shift_already_open' });
    const shift = { id: `shift-${Date.now()}`, openedAt: new Date().toISOString(), closedAt: null, openingCash: Number(input.openingCash || 0), closingCash: null, openedBy: req.user?.name || 'сотрудник' }; shifts.push(shift); recordAudit(req, 'shift.opened', 'shift', shift.id, null, shift); return json(res, 201, shift);
  }
  const shiftClose = pathname.match(/^\/api\/shifts\/([^/]+)\/close$/);
  if (shiftClose && req.method === 'POST') {
    if (denyUnlessAny(req, res, ['floor', 'orders'])) return;
    const input = await body(req);
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(shiftClose[1])) { try { const { rows } = await repositories.pool.query('UPDATE shifts SET closed_at=now(),closing_cash=$1 WHERE id=$2 AND venue_id=$3 AND closed_at IS NULL RETURNING id,opened_at AS "openedAt",closed_at AS "closedAt",opening_cash AS "openingCash",closing_cash AS "closingCash"', [Number(input.closingCash || 0), shiftClose[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'shift_not_found_or_closed' }); recordAudit(req, 'shift.closed', 'shift', rows[0].id, null, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'shift_close_failed', detail: error.message }); } }
    const shift = shifts.find((entry) => entry.id === shiftClose[1]); if (!shift || shift.closedAt) return json(res, 404, { error: 'shift_not_found_or_closed' }); shift.closedAt = new Date().toISOString(); shift.closingCash = Number(input.closingCash || 0); recordAudit(req, 'shift.closed', 'shift', shift.id, null, shift); return json(res, 200, shift);
  }
  if (pathname === '/api/venue' && req.method === 'GET') {
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT id,name,phone,address,logo_url AS "logoUrl",timezone FROM venues WHERE id=$1', [venueDbId]); if (rows[0]) return json(res, 200, { ...venue, ...rows[0] }); } catch (_) {} }
    return json(res, 200, venue);
  }
  if (pathname === '/api/venue' && (req.method === 'PATCH' || req.method === 'PUT')) {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const before = { ...venue };
    if (input.phone !== undefined && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone))) return json(res, 400, { error: 'invalid_phone' });
    if (input.logoUrl !== undefined && input.logoUrl !== null && !validImageData(input.logoUrl)) return json(res, 400, { error: 'invalid_logo' });
    Object.assign(venue, Object.fromEntries(['name', 'phone', 'address', 'logoUrl'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]])));
    if (repositories?.pool) { try { await repositories.pool.query('UPDATE venues SET name=$1,phone=$2,address=$3,logo_url=$4 WHERE id=$5', [venue.name, venue.phone, venue.address, venue.logoUrl, venueDbId]); } catch (_) {} }
    recordAudit(req, 'venue.updated', 'venue', venue.id, before, venue); return json(res, 200, venue);
  }
  if (pathname === '/api/integrations') { if (denyUnlessAny(req, res, ['diagnostics', 'settings'])) return; return json(res, 200, integrations); }
  if (pathname === '/api/metrics') {
    if (repositories?.pool) {
      try {
        const [ordersMetric, discountsMetric, staffMetric, reservationsMetric, stockMetric] = await Promise.all([
          repositories.pool.query(`SELECT COUNT(*) FILTER (WHERE status IN ('open','in_progress','ready'))::int AS open_orders, COUNT(*) FILTER (WHERE status='closed')::int AS closed_orders FROM orders WHERE venue_id=$1`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM discounts d JOIN orders o ON o.id=d.order_id WHERE o.venue_id=$1 AND d.status='requested'`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE venue_id=$1 AND is_active=true`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM reservations WHERE venue_id=$1 AND starts_at::date=CURRENT_DATE AND status='confirmed'`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM ingredients WHERE venue_id=$1 AND on_hand <= min_level`, [venueDbId])
        ]);
        const orderRow = ordersMetric.rows[0] || {};
        return json(res, 200, { openOrders: Number(orderRow.open_orders || 0), closedOrders: Number(orderRow.closed_orders || 0), discountRequests: Number(discountsMetric.rows[0]?.count || 0), staffActive: Number(staffMetric.rows[0]?.count || 0), reservationsToday: Number(reservationsMetric.rows[0]?.count || 0), lowStock: Number(stockMetric.rows[0]?.count || 0) });
      } catch (error) {
        return json(res, 503, { error: 'database_unavailable', detail: error.message });
      }
    }
    return json(res, 200, metrics());
  }
  if (pathname === '/api/audit' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'diagnostics') && !hasPermission(req, 'settings')) return json(res, 403, { error: 'forbidden', permission: 'diagnostics' });
    if (repositories?.audit) { try { return json(res, 200, { items: await repositories.audit.list(venueDbId) }); } catch (_) {} }
    return json(res, 200, { items: auditEvents.slice(-100).reverse() });
  }
  if (pathname === '/api/floor') {
    if (denyUnless(req, res, 'floor')) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT z.id AS zone_id,z.name AS zone_name,z.sort_order,t.id,t.name,t.status,t.capacity,t.min_order_total FROM zones z JOIN tables t ON t.zone_id=z.id WHERE z.venue_id=$1 ORDER BY z.sort_order,t.name`, [venueDbId]); const zones = []; for (const row of rows) { let zone = zones.find((entry) => entry.id === row.zone_id); if (!zone) { zone = { id: row.zone_id, name: row.zone_name, tables: [] }; zones.push(zone); } zone.tables.push({ id: row.id, name: row.name, status: row.status, capacity: row.capacity, minimumOrderTotal: Number(row.min_order_total) }); } return json(res, 200, { zones }); } catch (_) {} }
    return json(res, 200, { zones: floor });
  }
  if (pathname === '/api/products') {
    if (denyUnless(req, res, 'floor')) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT id,name,sale_price AS price,category AS station,search_aliases AS aliases,image_url AS "imageUrl" FROM products WHERE venue_id=$1 AND is_active=true ORDER BY name`, [venueDbId]); return json(res, 200, { items: rows.map((row) => ({ ...row, price: Number(row.price) })) }); } catch (_) {} }
    return json(res, 200, { items: products });
  }
  const productImage = pathname.match(/^\/api\/products\/([^/]+)\/image$/);
  if (productImage && req.method === 'POST') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req); const imageData = String(input.imageData || '');
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData) || imageData.length > 2_000_000) return json(res, 400, { error: 'invalid_image', message: 'Поддерживаются PNG, JPG и WebP до 1.5 МБ' });
    if (repositories?.inventory) { const product = await repositories.inventory.setProductImage(venueDbId, productImage[1], imageData); if (!product) return json(res, 404, { error: 'product_not_found' }); recordAudit(req, 'product.image_updated', 'product', product.id, null, product); return json(res, 200, product); }
    const product = products.find((entry) => entry.id === productImage[1]); if (!product) return json(res, 404, { error: 'product_not_found' }); product.imageUrl = imageData; recordAudit(req, 'product.image_updated', 'product', product.id, null, product); return json(res, 200, product);
  }
  if (pathname === '/api/session') {
    const role = url.searchParams.get('role') || 'bartender';
    const persistedSession = await sessionFromRequest(req);
    const user = req.user || persistedSession?.user || { name: 'Демо сотрудник', role };
    return json(res, 200, { user, permissions: rolePermissions[user.role] || [] });
  }
  if (pathname === '/api/staff' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'staff') && !hasPermission(req, 'settings')) return json(res, 403, { error: 'forbidden', permission: 'staff' });
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl" FROM users WHERE venue_id=$1 ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows }); } catch (_) {} }
    return json(res, 200, { items: staff.map(({ passwordHash, ...person }) => person) });
  }
  if (pathname === '/api/staff' && req.method === 'POST') {
    if (denyUnless(req, res, 'staff')) return;
    const input = await body(req);
    if (!input.name || !rolePermissions[input.role]) return json(res, 400, { error: 'name_and_valid_role_required' });
    if (repositories?.pool) { try { const login = input.login || `user_${Date.now()}`; const passwordHash = input.password ? await hashPassword(input.password) : null; const { rows } = await repositories.pool.query(`INSERT INTO users (venue_id,full_name,login,pin_hash,role,avatar_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl"`, [venueDbId, input.name, login, passwordHash, input.role, input.avatarUrl || null]); recordAudit(req, 'staff.created', 'staff', rows[0].id, null, rows[0]); return json(res, 201, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_create_failed', detail: error.message }); } }
    const person = { id: `u-${Date.now()}`, name: input.name, login: input.login || `user_${Date.now()}`, passwordHash: input.password ? await hashPassword(input.password) : null, role: input.role, active: true, avatarUrl: input.avatarUrl || null };
    staff.push(person);
    const { passwordHash, ...publicPerson } = person;
    recordAudit(req, 'staff.created', 'staff', person.id, null, publicPerson);
    return json(res, 201, publicPerson);
  }
  const staffDelete = pathname.match(/^\/api\/staff\/([^/]+)$/);
  if (staffDelete && req.method === 'DELETE') {
    if (denyUnless(req, res, 'staff')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffDelete[1])) { try { const { rows } = await repositories.pool.query(`UPDATE users SET is_active=false WHERE id=$1 AND venue_id=$2 AND role <> 'owner' RETURNING id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl"`, [staffDelete[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'staff_not_found_or_owner' }); recordAudit(req, 'staff.deactivated', 'staff', rows[0].id, { active: true }, { active: false }); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_delete_failed', detail: error.message }); } }
    const person = staff.find((entry) => entry.id === staffDelete[1]);
    if (!person) return json(res, 404, { error: 'staff_not_found' });
    if (person.role === 'owner') return json(res, 409, { error: 'owner_cannot_be_deleted' });
    person.active = false; recordAudit(req, 'staff.deactivated', 'staff', person.id, { active: true }, { active: false });
    return json(res, 200, person);
  }
  const staffAvatar = pathname.match(/^\/api\/staff\/([^/]+)\/avatar$/);
  if (staffAvatar && req.method === 'POST') {
    if (denyUnless(req, res, 'staff')) return;
    const input = await body(req); if (!validImageData(input.imageData)) return json(res, 400, { error: 'invalid_avatar' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffAvatar[1])) { try { const { rows } = await repositories.pool.query(`UPDATE users SET avatar_url=$1 WHERE id=$2 AND venue_id=$3 RETURNING id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl"`, [input.imageData, staffAvatar[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'staff_not_found' }); recordAudit(req, 'staff.avatar_updated', 'staff', rows[0].id, null, { avatarUrl: '[image]' }); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_avatar_failed', detail: error.message }); } }
    const person = staff.find((entry) => entry.id === staffAvatar[1]); if (!person) return json(res, 404, { error: 'staff_not_found' });
    person.avatarUrl = input.imageData; recordAudit(req, 'staff.avatar_updated', 'staff', person.id, null, { avatarUrl: '[image]' }); return json(res, 200, person);
  }
  if (pathname === '/api/inventory' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'inventory') && !hasPermission(req, 'inventory_read')) return json(res, 403, { error: 'forbidden', permission: 'inventory' });
    if (repositories?.inventory) { try { const data = await repositories.inventory.list(venueDbId); return json(res, 200, { ...data, lowStock: data.items.filter((item) => item.onHand <= item.minLevel) }); } catch (_) {} }
    return json(res, 200, { items: inventory, lowStock: inventory.filter((item) => item.onHand <= item.minLevel), movements: stockMovements.slice(-20).reverse() });
  }
  if (pathname === '/api/inventory/movements' && req.method === 'POST') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req);
    if (repositories?.inventory) {
      const current = await repositories.inventory.list(venueDbId); const item = current.items.find((entry) => entry.id === input.itemId); const delta = Number(input.delta);
      if (!item || !Number.isFinite(delta) || delta === 0) return json(res, 400, { error: 'item_and_nonzero_delta_required' });
      if (item.onHand + delta < 0) return json(res, 409, { error: 'insufficient_stock', onHand: item.onHand });
      const movement = await repositories.inventory.move({ venueId: venueDbId, ingredientId: item.id, direction: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), reason: input.reason, createdBy: null });
      recordAudit(req, 'inventory.movement', 'inventory', item.id, { onHand: item.onHand }, { onHand: item.onHand + delta, movement });
      return json(res, 201, { ...movement, itemName: item.name, delta });
    }
    const item = inventory.find((entry) => entry.id === input.itemId);
    const delta = Number(input.delta);
    if (!item || !Number.isFinite(delta) || delta === 0) return json(res, 400, { error: 'item_and_nonzero_delta_required' });
    if (item.onHand + delta < 0) return json(res, 409, { error: 'insufficient_stock', onHand: item.onHand });
    item.onHand = Math.round((item.onHand + delta) * 100) / 100;
    const movement = { id: `mov-${Date.now()}`, itemId: item.id, itemName: item.name, delta, reason: input.reason || 'Корректировка', createdAt: new Date().toISOString() };
    stockMovements.push(movement);
    recordAudit(req, 'inventory.movement', 'inventory', item.id, { onHand: item.onHand - delta }, { onHand: item.onHand, movement });
    return json(res, 201, movement);
  }
  if (pathname === '/api/finance/summary' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'finance') && !hasPermission(req, 'finance_read')) return json(res, 403, { error: 'forbidden', permission: 'finance' });
    if (repositories?.pool) {
      const date = url.searchParams.get('date') || today();
      try {
        const totals = await repositories.pool.query(`
          SELECT COALESCE(SUM(p.amount), 0) AS revenue, COUNT(DISTINCT o.id)::int AS closed_orders
          FROM orders o JOIN payments p ON p.order_id=o.id
          WHERE o.venue_id=$1 AND o.status='closed'
            AND o.closed_at >= $2::date AND o.closed_at < ($2::date + INTERVAL '1 day')
            AND p.status IN ('paid','partially_paid')`, [venueDbId, date]);
        const methods = await repositories.pool.query(`
          SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount
          FROM orders o JOIN payments p ON p.order_id=o.id
          WHERE o.venue_id=$1 AND o.status='closed'
            AND o.closed_at >= $2::date AND o.closed_at < ($2::date + INTERVAL '1 day')
            AND p.status IN ('paid','partially_paid')
          GROUP BY p.method ORDER BY p.method`, [venueDbId, date]);
        const pending = await repositories.pool.query(`
          SELECT COUNT(*)::int AS count FROM discounts d JOIN orders o ON o.id=d.order_id
          WHERE o.venue_id=$1 AND d.status='requested'`, [venueDbId]);
        const row = totals.rows[0] || { revenue: 0, closed_orders: 0 };
        return json(res, 200, { date, revenue: Number(row.revenue || 0), closedOrders: Number(row.closed_orders || 0), byPaymentMethod: Object.fromEntries(methods.rows.map((entry) => [entry.method, Number(entry.amount || 0)])), pendingDiscounts: Number(pending.rows[0]?.count || 0) });
      } catch (error) {
        return json(res, 503, { error: 'database_unavailable', detail: error.message });
      }
    }
    const closed = orders.filter((order) => order.status === 'closed');
    const revenue = closed.reduce((sum, order) => sum + Number(order.finalTotal || orderTotal(order)), 0);
    const byType = closed.reduce((result, order) => { const key = order.paymentMethod || 'не указан'; result[key] = (result[key] || 0) + Number(order.finalTotal || orderTotal(order)); return result; }, {});
    return json(res, 200, { date: url.searchParams.get('date') || today(), revenue, closedOrders: closed.length, byPaymentMethod: byType, pendingDiscounts: discountRequests.filter((request) => request.status === 'requested').length });
  }
  if (pathname === '/api/reservations' && req.method === 'GET') {
    if (denyUnless(req, res, 'reservations')) return;
    const date = url.searchParams.get('date');
    if (repositories?.reservations) { try { return json(res, 200, { items: await repositories.reservations.list(venueDbId, date) }); } catch (_) {} }
    return json(res, 200, { items: date ? reservations.filter((reservation) => reservation.date === date) : reservations });
  }
  if (pathname === '/api/reservations' && req.method === 'POST') {
    if (denyUnless(req, res, 'reservations')) return;
    const input = await body(req);
    if (!input.guestName || !input.date || !input.time || !input.tableId) return json(res, 400, { error: 'guest_date_time_table_required' });
    if (repositories?.reservations) { try { const reservation = await repositories.reservations.create({ ...input, venueId: venueDbId }); recordAudit(req, 'reservation.created', 'reservation', reservation.id, null, reservation); return json(res, 201, reservation); } catch (error) { return json(res, 409, { error: 'reservation_create_failed', detail: error.message }); } }
    const table = floor.flatMap((zone) => zone.tables).find((entry) => entry.id === input.tableId);
    if (!table) return json(res, 400, { error: 'table_not_found' });
    const reservation = { id: `res-${Date.now()}`, guestName: input.guestName, phone: input.phone || '', date: input.date, time: input.time, tableId: input.tableId, tableName: table.name, guests: Number(input.guests || 1), status: 'confirmed', deposit: Number(input.deposit || 0), notes: input.notes || '' };
    reservations.push(reservation);
    table.status = 'reserved';
    recordAudit(req, 'reservation.created', 'reservation', reservation.id, null, reservation);
    return json(res, 201, reservation);
  }
  if (pathname.startsWith('/api/reservations/') && req.method === 'POST' && pathname.endsWith('/cancel')) {
    if (denyUnless(req, res, 'reservations')) return;
    const reservationId = pathname.split('/')[3];
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(reservationId)) {
      try {
        const { rows } = await repositories.pool.query(`UPDATE reservations SET status='cancelled' WHERE id=$1 AND venue_id=$2 AND status='confirmed' RETURNING id,table_id AS "tableId",status`, [reservationId, venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'reservation_not_found_or_cancelled' });
        await repositories.pool.query(`UPDATE tables SET status='free' WHERE id=$1 AND venue_id=$2 AND NOT EXISTS (SELECT 1 FROM reservations WHERE table_id=$1 AND venue_id=$2 AND status='confirmed' AND starts_at::date=CURRENT_DATE)`, [rows[0].tableId, venueDbId]);
        recordAudit(req, 'reservation.cancelled', 'reservation', rows[0].id, { status: 'confirmed' }, rows[0]);
        return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'reservation_cancel_failed', detail: error.message }); }
    }
    const reservation = reservations.find((entry) => entry.id === pathname.split('/')[3]);
    if (!reservation) return json(res, 404, { error: 'reservation_not_found' });
    reservation.status = 'cancelled';
    recordAudit(req, 'reservation.cancelled', 'reservation', reservation.id, { status: 'confirmed' }, reservation);
    return json(res, 200, reservation);
  }
  if (pathname === '/api/orders' && req.method === 'GET') {
    if (denyUnless(req, res, 'orders')) return;
    if (orderRepository) {
      try { return json(res, 200, { items: await orderRepository.listOpen(venueDbId) }); } catch (_) { return json(res, 503, { error: 'database_unavailable' }); }
    }
    return json(res, 200, { items: orders });
  }
  if (pathname === '/api/orders' && req.method === 'POST') {
    if (denyUnless(req, res, 'orders')) return;
    const input = await body(req);
    if (repositories?.orders) {
      try {
        const openedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001';
        const persisted = await repositories.orders.create({ venueId: venueDbId, tableId: input.tableId, openedBy, reservationId: input.reservationId, vipMinimum: Number(input.minimumOrderTotal || 0), notes: input.notes });
        recordAudit(req, 'order.created', 'order', persisted.id, null, persisted);
        return json(res, 201, { ...persisted, items: [] });
      } catch (error) { return json(res, 409, { error: 'order_create_failed', detail: error.message }); }
    }
    const order = { id: `ord-${Date.now()}`, tableId: input.tableId || null, status: 'open', orderType: input.orderType || 'regular', minimumOrderTotal: Number(input.minimumOrderTotal || 0), notes: input.notes || '', items: [], createdAt: new Date().toISOString() };
    orders.push(order);
    recordAudit(req, 'order.created', 'order', order.id, null, order);
    return json(res, 201, order);
  }
  const orderEdit = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderEdit && req.method === 'PATCH') {
    if (denyUnless(req, res, 'orders')) return;
    const input = await body(req); if (input.notes === undefined && input.guestName === undefined && input.phone === undefined) return json(res, 400, { error: 'supported_fields_required' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderEdit[1])) {
      try {
        let guest = null;
        if (input.guestName !== undefined || input.phone !== undefined) {
          const { rows } = await repositories.pool.query(`INSERT INTO guests (phone,full_name) VALUES ($1,$2) ON CONFLICT (phone) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id,phone,full_name AS "name"`, [String(input.phone || '').trim() || null, String(input.guestName || '').trim() || null]);
          guest = rows[0];
          await repositories.pool.query('UPDATE orders SET guest_id=$1 WHERE id=$2 AND venue_id=$3', [guest.id, orderEdit[1], venueDbId]);
        }
        if (input.notes !== undefined) await repositories.pool.query('UPDATE orders SET notes=$1 WHERE id=$2 AND venue_id=$3', [String(input.notes).slice(0, 2000), orderEdit[1], venueDbId]);
        const { rows } = await repositories.pool.query(`SELECT o.id,o.notes,o.guest_id AS "guestId",g.phone,g.full_name AS "guestName" FROM orders o LEFT JOIN guests g ON g.id=o.guest_id WHERE o.id=$1 AND o.venue_id=$2`, [orderEdit[1], venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'order_not_found' });
        recordAudit(req, guest ? 'order.guest_updated' : 'order.notes_updated', 'order', rows[0].id, null, rows[0]); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_update_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderEdit[1]); if (!order) return json(res, 404, { error: 'order_not_found' });
    if (input.notes !== undefined) order.notes = String(input.notes).slice(0, 2000);
    if (input.guestName !== undefined || input.phone !== undefined) { order.guestName = String(input.guestName || '').trim(); order.guestPhone = String(input.phone || '').trim(); }
    recordAudit(req, input.guestName !== undefined || input.phone !== undefined ? 'order.guest_updated' : 'order.notes_updated', 'order', order.id, null, { notes: order.notes, guestName: order.guestName, guestPhone: order.guestPhone }); return json(res, 200, order);
  }
  const orderAction = pathname.match(/^\/api\/orders\/([^/]+)\/(status|transfer)$/);
  if (orderAction && req.method === 'POST') {
    if (denyUnless(req, res, 'orders')) return;
    const input = await body(req);
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderAction[1])) {
      try {
        if (orderAction[2] === 'status') {
          const allowed = ['open', 'in_progress', 'ready', 'closed', 'cancelled'];
          if (!allowed.includes(input.status)) return json(res, 400, { error: 'invalid_order_status' });
          const { rows } = await repositories.pool.query('UPDATE orders SET status=$1,closed_at=CASE WHEN $1=\'closed\' THEN now() ELSE closed_at END WHERE id=$2 AND venue_id=$3 RETURNING id,status,table_id AS "tableId"', [input.status, orderAction[1], venueDbId]);
          if (!rows[0]) return json(res, 404, { error: 'order_not_found' });
          recordAudit(req, 'order.status_changed', 'order', rows[0].id, null, rows[0]); return json(res, 200, rows[0]);
        }
        if (!input.tableId) return json(res, 400, { error: 'table_id_required' });
        const { rows } = await repositories.pool.query('UPDATE orders SET table_id=$1 WHERE id=$2 AND venue_id=$3 RETURNING id,status,table_id AS "tableId"', [input.tableId, orderAction[1], venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'order_not_found' });
        recordAudit(req, 'order.transferred', 'order', rows[0].id, null, rows[0]); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_action_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderAction[1]);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (orderAction[2] === 'status') {
      if (!['open', 'in_progress', 'ready', 'closed', 'cancelled'].includes(input.status)) return json(res, 400, { error: 'invalid_order_status' });
      const before = { status: order.status }; order.status = input.status; if (input.status === 'closed') order.closedAt = new Date().toISOString();
      recordAudit(req, 'order.status_changed', 'order', order.id, before, { status: order.status }); return json(res, 200, order);
    }
    if (!input.tableId) return json(res, 400, { error: 'table_id_required' });
    const before = { tableId: order.tableId }; order.tableId = input.tableId; recordAudit(req, 'order.transferred', 'order', order.id, before, { tableId: order.tableId }); return json(res, 200, order);
  }
  const itemMatch = pathname.match(/^\/api\/orders\/([^/]+)\/items$/);
  if (itemMatch && req.method === 'POST') {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(itemMatch[1])) {
      const input = await body(req);
      try { const { rows: productRows } = await repositories.pool.query('SELECT id,name,sale_price AS "unitPrice",category AS station FROM products WHERE id=$1 AND venue_id=$2 AND is_active=true', [input.productId, venueDbId]); const product = productRows[0]; if (!product) return json(res, 400, { error: 'product_not_found' }); const { rows } = await repositories.pool.query('INSERT INTO order_items (order_id,product_id,quantity,unit_price,station) VALUES ($1,$2,$3,$4,$5) RETURNING id,product_id AS "productId",quantity,unit_price AS "unitPrice",station', [itemMatch[1], product.id, Number(input.quantity || 1), product.unitPrice, product.station]); return json(res, 201, { ...rows[0], name: product.name }); } catch (error) { return json(res, 409, { error: 'order_item_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === itemMatch[1]);
    const input = await body(req);
    const product = products.find((entry) => entry.id === input.productId);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (!product) return json(res, 400, { error: 'product_not_found' });
    const item = { id: `item-${Date.now()}`, productId: product.id, name: product.name, quantity: Number(input.quantity || 1), unitPrice: product.price, station: product.station };
    order.items.push(item);
    return json(res, 201, item);
  }
  const itemAction = pathname.match(/^\/api\/orders\/([^/]+)\/items\/([^/]+)$/);
  if (itemAction && (req.method === 'PATCH' || req.method === 'DELETE')) {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(itemAction[1]) && /^[0-9a-f-]{36}$/i.test(itemAction[2])) {
      try {
        if (req.method === 'DELETE') { const { rows } = await repositories.pool.query('DELETE FROM order_items WHERE id=$1 AND order_id=$2 RETURNING id', [itemAction[2], itemAction[1]]); if (!rows[0]) return json(res, 404, { error: 'order_item_not_found' }); return json(res, 200, rows[0]); }
        const input = await body(req); const quantity = Number(input.quantity); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' }); const { rows } = await repositories.pool.query('UPDATE order_items SET quantity=$1 WHERE id=$2 AND order_id=$3 RETURNING id,quantity,unit_price AS "unitPrice"', [quantity, itemAction[2], itemAction[1]]); if (!rows[0]) return json(res, 404, { error: 'order_item_not_found' }); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_item_update_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === itemAction[1]); const item = order?.items?.find((entry) => entry.id === itemAction[2]); if (!item) return json(res, 404, { error: 'order_item_not_found' });
    if (req.method === 'DELETE') { order.items = order.items.filter((entry) => entry.id !== item.id); return json(res, 200, { id: item.id }); }
    const input = await body(req); const quantity = Number(input.quantity); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' }); item.quantity = quantity; return json(res, 200, item);
  }
  const paymentPath = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);
  if (paymentPath && (req.method === 'GET' || req.method === 'POST')) {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(paymentPath[1])) {
      try {
        const { rows: orderRows } = await repositories.pool.query('SELECT id,status,vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [paymentPath[1], venueDbId]);
        const persisted = orderRows[0]; if (!persisted) return json(res, 404, { error: 'order_not_found' });
        const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [paymentPath[1]]);
        const subtotal = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); const due = Math.max(subtotal, Number(persisted.minimumOrderTotal || 0));
        if (req.method === 'GET') { const { rows } = await repositories.pool.query('SELECT id,method,amount,status,created_at AS "createdAt" FROM payments WHERE order_id=$1 ORDER BY created_at', [paymentPath[1]]); return json(res, 200, { items: rows, due, paid: rows.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0), remaining: Math.max(0, due - rows.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0)) }); }
        const input = await body(req); const amount = Number(input.amount); const method = String(input.method || 'cash'); if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'card', 'qr'].includes(method)) return json(res, 400, { error: 'valid_method_and_amount_required' });
        const { rows: paidRows } = await repositories.pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND status=\'paid\'', [paymentPath[1]]); const paid = Number(paidRows[0]?.paid || 0); if (paid + amount > due + 0.01) return json(res, 409, { error: 'payment_exceeds_due', remaining: Math.max(0, due - paid) });
        const { rows } = await repositories.pool.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,\'paid\') RETURNING id,method,amount,status,created_at AS "createdAt"', [paymentPath[1], method, amount]); const nextPaid = paid + amount; if (nextPaid >= due) await repositories.pool.query('UPDATE orders SET status=\'closed\',closed_at=now() WHERE id=$1', [paymentPath[1]]); recordAudit(req, 'order.payment_added', 'payment', rows[0].id, null, rows[0]); return json(res, 201, { ...rows[0], due, paid: nextPaid, remaining: Math.max(0, due - nextPaid), closed: nextPaid >= due });
      } catch (error) { return json(res, 409, { error: 'payment_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === paymentPath[1]); if (!order) return json(res, 404, { error: 'order_not_found' }); order.payments ||= []; const subtotal = orderTotal(order); const due = Math.max(subtotal, Number(order.minimumOrderTotal || 0)); const paid = order.payments.reduce((sum, item) => sum + Number(item.amount), 0);
    if (req.method === 'GET') return json(res, 200, { items: order.payments, due, paid, remaining: Math.max(0, due - paid) });
    const input = await body(req); const amount = Number(input.amount); const method = String(input.method || 'cash'); if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'card', 'qr'].includes(method)) return json(res, 400, { error: 'valid_method_and_amount_required' }); if (paid + amount > due + 0.01) return json(res, 409, { error: 'payment_exceeds_due', remaining: Math.max(0, due - paid) }); const payment = { id: `pay-${Date.now()}`, method, amount, status: 'paid', createdAt: new Date().toISOString() }; order.payments.push(payment); const nextPaid = paid + amount; if (nextPaid >= due) { order.status = 'closed'; order.closedAt = payment.createdAt; } recordAudit(req, 'order.payment_added', 'payment', payment.id, null, payment); return json(res, 201, { ...payment, due, paid: nextPaid, remaining: Math.max(0, due - nextPaid), closed: nextPaid >= due });
  }
  const orderPath = pathname.match(/^\/api\/orders\/([^/]+)\/(summary|close|split|discount-requests)$/);
  if (orderPath && req.method === 'GET' && orderPath[2] === 'summary') {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderPath[1])) {
      try {
        const { rows: orderRows } = await repositories.pool.query('SELECT id,vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [orderPath[1], venueDbId]);
        if (!orderRows[0]) return json(res, 404, { error: 'order_not_found' });
        const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [orderPath[1]]);
        const total = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
        const minimum = Number(orderRows[0].minimumOrderTotal || 0);
        return json(res, 200, { orderId: orderRows[0].id, total, minimum, shortfall: Math.max(0, minimum - total), minimumApplied: minimum > 0 });
      } catch (error) { return json(res, 503, { error: 'database_unavailable', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]);
    return order ? json(res, 200, vipSummary(order)) : json(res, 404, { error: 'order_not_found' });
  }
  if (orderPath && req.method === 'POST' && orderPath[2] === 'close') {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderPath[1])) {
      const input = await body(req);
      try { const { rows: orderRows } = await repositories.pool.query('SELECT id,status,vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [orderPath[1], venueDbId]); const persisted = orderRows[0]; if (!persisted) return json(res, 404, { error: 'order_not_found' }); const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [orderPath[1]]); const subtotal = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); const minimum = Number(persisted.minimumOrderTotal || 0); const finalTotal = Math.max(subtotal, minimum); const { rows } = await repositories.pool.query('UPDATE orders SET status=$1,closed_at=now() WHERE id=$2 RETURNING *', ['closed', orderPath[1]]); if (finalTotal > 0) await repositories.pool.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,$4)', [orderPath[1], input.paymentMethod || 'cash', finalTotal, 'paid']); const result = { ...rows[0], subtotal, finalTotal, minimumAdjustment: Math.max(0, minimum - subtotal), paymentMethod: input.paymentMethod || 'cash' }; recordAudit(req, 'order.closed', 'order', orderPath[1], { status: persisted.status }, result); return json(res, 200, result); } catch (error) { return json(res, 409, { error: 'order_close_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    const input = await body(req);
    const total = orderTotal(order); const minimum = Number(order.minimumOrderTotal || 0);
    order.status = 'closed'; order.closedAt = new Date().toISOString(); order.subtotal = total; order.finalTotal = Math.max(total, minimum); order.minimumAdjustment = Math.max(0, minimum - total); order.paymentMethod = input.paymentMethod || 'cash';
    recordAudit(req, 'order.closed', 'order', order.id, { status: 'open' }, { status: order.status, subtotal: order.subtotal, finalTotal: order.finalTotal, minimumAdjustment: order.minimumAdjustment, paymentMethod: order.paymentMethod });
    return json(res, 200, order);
  }
  if (orderPath && req.method === 'POST' && orderPath[2] === 'split') {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderPath[1])) {
      const input = await body(req); const ids = Array.isArray(input.itemIds) ? input.itemIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : [];
      if (!ids.length) return json(res, 400, { error: 'item_ids_required' });
      const client = await repositories.pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: sourceRows } = await client.query('SELECT id,venue_id,table_id,reservation_id,opened_by,vip_minimum,status FROM orders WHERE id=$1 AND venue_id=$2 FOR UPDATE', [orderPath[1], venueDbId]);
        const source = sourceRows[0]; if (!source) { await client.query('ROLLBACK'); return json(res, 404, { error: 'order_not_found' }); }
        const { rows: moved } = await client.query('SELECT oi.id,oi.product_id AS "productId",p.name,oi.quantity,oi.unit_price AS "unitPrice",oi.station,oi.status,oi.guest_number AS "guestNumber" FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 AND oi.id=ANY($2::uuid[]) FOR UPDATE', [source.id, ids]);
        if (!moved.length) { await client.query('ROLLBACK'); return json(res, 400, { error: 'item_ids_required' }); }
        const { rows: targetRows } = await client.query('INSERT INTO orders (venue_id,table_id,reservation_id,opened_by,vip_minimum,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,venue_id AS "venueId",table_id AS "tableId",reservation_id AS "reservationId",status,vip_minimum AS "minimumOrderTotal",created_at AS "createdAt"', [source.venue_id, source.table_id, source.reservation_id, source.opened_by, source.vip_minimum, 'open']);
        const target = targetRows[0]; await client.query('UPDATE order_items SET order_id=$1 WHERE id=ANY($2::uuid[]) AND order_id=$3', [target.id, ids, source.id]); await client.query('COMMIT');
        const result = { ...target, items: moved, splitFrom: source.id }; recordAudit(req, 'order.split', 'order', source.id, { itemCount: moved.length }, { itemCount: moved.length, newOrderId: target.id }); return json(res, 201, result);
      } catch (error) { await client.query('ROLLBACK'); return json(res, 409, { error: 'order_split_failed', detail: error.message }); } finally { client.release(); }
    }
    const source = orders.find((entry) => entry.id === orderPath[1]);
    if (!source) return json(res, 404, { error: 'order_not_found' });
    const input = await body(req); const ids = new Set(input.itemIds || []); const moved = source.items.filter((item) => ids.has(item.id));
    if (!moved.length) return json(res, 400, { error: 'item_ids_required' });
    source.items = source.items.filter((item) => !ids.has(item.id));
    const target = { id: `ord-${Date.now()}`, tableId: source.tableId, status: 'open', items: moved, splitFrom: source.id, createdAt: new Date().toISOString() };
    orders.push(target); recordAudit(req, 'order.split', 'order', source.id, { itemCount: source.items.length + moved.length }, { itemCount: source.items.length, newOrderId: target.id }); return json(res, 201, target);
  }
  if (orderPath && req.method === 'POST' && orderPath[2] === 'discount-requests') {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderPath[1])) {
      const input = await body(req); if (!input.reason || !input.value) return json(res, 400, { error: 'reason_and_value_required' });
      try { const requestedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001'; const { rows } = await repositories.pool.query('INSERT INTO discounts (order_id,requested_by,type,value,reason) SELECT id,$2,$3,$4,$5 FROM orders WHERE id=$1 AND venue_id=$6 RETURNING id,order_id AS "orderId",type,value,reason,status,requested_by AS "requestedBy",created_at AS "createdAt"', [orderPath[1], requestedBy, input.type || 'percent', Number(input.value), input.reason, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'order_not_found' }); recordAudit(req, 'discount.requested', 'discount', rows[0].id, null, rows[0]); return json(res, 201, rows[0]); } catch (error) { return json(res, 409, { error: 'discount_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]); const input = await body(req);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (!input.reason || !input.value) return json(res, 400, { error: 'reason_and_value_required' });
    const request = { id: `disc-${Date.now()}`, orderId: order.id, type: input.type || 'percent', value: Number(input.value), reason: input.reason, status: 'requested', requestedBy: input.requestedBy || 'unknown', createdAt: new Date().toISOString() };
    discountRequests.push(request); recordAudit(req, 'discount.requested', 'discount', request.id, null, request); return json(res, 201, request);
  }
  if (pathname === '/api/discount-requests' && req.method === 'GET') {
    if (denyUnlessAny(req, res, ['finance', 'finance_read'])) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT d.id,d.order_id AS "orderId",d.type,d.value,d.reason,d.status,d.requested_by AS "requestedBy",d.approved_by AS "approvedBy",d.created_at AS "createdAt",d.decided_at AS "decidedAt",g.full_name AS "guestName",g.phone AS "guestPhone" FROM discounts d JOIN orders o ON o.id=d.order_id LEFT JOIN guests g ON g.id=o.guest_id WHERE o.venue_id=$1 ORDER BY d.created_at DESC', [venueDbId]); return json(res, 200, { items: rows }); } catch (error) { return json(res, 503, { error: 'database_unavailable' }); } }
    return json(res, 200, { items: discountRequests });
  }
  const decision = pathname.match(/^\/api\/discount-requests\/([^/]+)\/(approve|reject)$/);
  if (decision && req.method === 'POST') {
    if (denyUnless(req, res, 'finance')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(decision[1])) {
      const input = await body(req); const status = decision[2] === 'approve' ? 'approved' : 'rejected'; const decidedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001';
      try { const { rows } = await repositories.pool.query('UPDATE discounts SET status=$1,approved_by=$2,decided_at=now() WHERE id=$3 AND status=$4 RETURNING id,order_id AS "orderId",type,value,reason,status,requested_by AS "requestedBy",approved_by AS "approvedBy",created_at AS "createdAt",decided_at AS "decidedAt"', [status, decidedBy, decision[1], 'requested']); if (!rows[0]) return json(res, 409, { error: 'discount_not_found_or_decided' }); recordAudit(req, `discount.${status}`, 'discount', rows[0].id, { status: 'requested' }, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'discount_decision_failed', detail: error.message }); }
    }
    const request = discountRequests.find((entry) => entry.id === decision[1]);
    if (!request) return json(res, 404, { error: 'discount_not_found' });
    if (request.status !== 'requested') return json(res, 409, { error: 'already_decided' });
    const input = await body(req); const before = { ...request }; request.status = decision[2] === 'approve' ? 'approved' : 'rejected'; request.decidedBy = input.decidedBy || 'unknown'; request.decidedAt = new Date().toISOString(); recordAudit(req, `discount.${request.status}`, 'discount', request.id, before, request);
    return json(res, 200, request);
  }
  return null;
}

function staticFile(req, res) {
  let requestPath = new URL(req.url, 'http://localhost').pathname;
  const routePath = requestPath.length > 1 ? requestPath.replace(/\/+$/, '') : requestPath;
  const aliases = { '/': '/index.html', '/admin': '/admin.html', '/login': '/login.html', '/inventory': '/inventory.html', '/finance': '/finance.html', '/reservations': '/reservations.html' };
  requestPath = aliases[routePath] || requestPath;
  const file = path.resolve(root, `.${requestPath}`);
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  return res.end(fs.readFileSync(file));
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) { const result = await api(req, res); if (result !== null) return result; }
    return staticFile(req, res);
  } catch (error) { return json(res, 500, { error: 'internal_error', message: error.message }); }
}).listen(process.env.PORT || 3000, () => console.log(`CRM running on http://localhost:${process.env.PORT || 3000}`));

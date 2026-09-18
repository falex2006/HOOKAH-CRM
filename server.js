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
const demoAccounts = [
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
  if (pathname === '/api/metrics') return json(res, 200, metrics());
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
    const user = req.user || { name: 'Демо сотрудник', role };
    return json(res, 200, { user, permissions: rolePermissions[user.role] || [] });
  }
  if (pathname === '/api/staff' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'staff') && !hasPermission(req, 'settings')) return json(res, 403, { error: 'forbidden', permission: 'staff' });
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl" FROM users WHERE venue_id=$1 ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows }); } catch (_) {} }
    return json(res, 200, { items: staff });
  }
  if (pathname === '/api/staff' && req.method === 'POST') {
    if (denyUnless(req, res, 'staff')) return;
    const input = await body(req);
    if (!input.name || !rolePermissions[input.role]) return json(res, 400, { error: 'name_and_valid_role_required' });
    if (repositories?.pool) { try { const login = input.login || `user_${Date.now()}`; const passwordHash = input.password ? await hashPassword(input.password) : null; const { rows } = await repositories.pool.query(`INSERT INTO users (venue_id,full_name,login,pin_hash,role,avatar_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl"`, [venueDbId, input.name, login, passwordHash, input.role, input.avatarUrl || null]); recordAudit(req, 'staff.created', 'staff', rows[0].id, null, rows[0]); return json(res, 201, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_create_failed', detail: error.message }); } }
    const person = { id: `u-${Date.now()}`, name: input.name, role: input.role, active: true, avatarUrl: input.avatarUrl || null };
    staff.push(person);
    recordAudit(req, 'staff.created', 'staff', person.id, null, person);
    return json(res, 201, person);
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
    const reservation = reservations.find((entry) => entry.id === pathname.split('/')[3]);
    if (!reservation) return json(res, 404, { error: 'reservation_not_found' });
    reservation.status = 'cancelled';
    recordAudit(req, 'reservation.cancelled', 'reservation', reservation.id, { status: 'confirmed' }, reservation);
    return json(res, 200, reservation);
  }
  if (pathname === '/api/orders' && req.method === 'GET') {
    if (denyUnless(req, res, 'orders')) return;
    if (orderRepository) {
      try { return json(res, 200, { items: await orderRepository.listOpen(url.searchParams.get('venueId')) }); } catch (_) { return json(res, 503, { error: 'database_unavailable' }); }
    }
    return json(res, 200, { items: orders });
  }
  if (pathname === '/api/orders' && req.method === 'POST') {
    if (denyUnless(req, res, 'orders')) return;
    const input = await body(req);
    if (repositories?.orders) {
      try {
        const openedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001';
        const persisted = await repositories.orders.create({ venueId: venueDbId, tableId: input.tableId, openedBy, reservationId: input.reservationId, vipMinimum: Number(input.minimumOrderTotal || 0) });
        recordAudit(req, 'order.created', 'order', persisted.id, null, persisted);
        return json(res, 201, { ...persisted, items: [] });
      } catch (error) { return json(res, 409, { error: 'order_create_failed', detail: error.message }); }
    }
    const order = { id: `ord-${Date.now()}`, tableId: input.tableId || null, status: 'open', orderType: input.orderType || 'regular', minimumOrderTotal: Number(input.minimumOrderTotal || 0), items: [], createdAt: new Date().toISOString() };
    orders.push(order);
    recordAudit(req, 'order.created', 'order', order.id, null, order);
    return json(res, 201, order);
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
  const orderPath = pathname.match(/^\/api\/orders\/([^/]+)\/(summary|close|split|discount-requests)$/);
  if (orderPath && req.method === 'GET' && orderPath[2] === 'summary') {
    if (denyUnless(req, res, 'orders')) return;
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
        const { rows: moved } = await client.query('SELECT id,product_id AS "productId",quantity,unit_price AS "unitPrice",station,status,guest_number AS "guestNumber" FROM order_items WHERE order_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE', [source.id, ids]);
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
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT d.id,d.order_id AS "orderId",d.type,d.value,d.reason,d.status,d.requested_by AS "requestedBy",d.approved_by AS "approvedBy",d.created_at AS "createdAt",d.decided_at AS "decidedAt" FROM discounts d JOIN orders o ON o.id=d.order_id WHERE o.venue_id=$1 ORDER BY d.created_at DESC', [venueDbId]); return json(res, 200, { items: rows }); } catch (error) { return json(res, 503, { error: 'database_unavailable' }); } }
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

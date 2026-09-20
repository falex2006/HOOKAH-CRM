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
  { id: 'u-owner', name: 'Владелец', role: 'owner', active: true, avatarUrl: null, telegram: '', phoneNumbers: [], passportData: null },
  { id: 'u-maria', name: 'Мария', role: 'bartender', active: true, avatarUrl: null, telegram: '', phoneNumbers: [], passportData: null }
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
const loginAttempts = new Map();
const shifts = [];
const demoAccounts = [
  { username: 'admin', password: process.env.DEMO_ADMIN_PASSWORD || (process.env.AUTH_REQUIRED === 'true' ? '' : 'admin'), name: 'Администратор', role: 'admin' },
  { username: 'owner', password: process.env.DEMO_OWNER_PASSWORD || 'demo', name: 'Владелец', role: 'owner' },
  { username: 'staff', password: process.env.DEMO_STAFF_PASSWORD || 'demo', name: 'Мария', role: 'bartender' }
];

const hashPassword = async (password) => { const salt = crypto.randomBytes(16).toString('hex'); const derived = await scryptAsync(String(password), salt, 64); return `scrypt$${salt}$${derived.toString('hex')}`; };
const verifyPassword = async (password, stored) => {
  if (!stored) return false;
  if (!String(stored).startsWith('scrypt$')) { const actual = Buffer.from(String(password)); const expectedPlain = Buffer.from(String(stored)); return actual.length === expectedPlain.length && crypto.timingSafeEqual(actual, expectedPlain); }
  const [, salt, encoded] = String(stored).split('$'); const derived = await scryptAsync(String(password), salt, 64); const expected = Buffer.from(encoded || '', 'hex'); return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
};

const staffPassportCipher = {
  encrypt(value) {
    const secret = process.env.STAFF_PASSPORT_KEY;
    if (!secret) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { data: encrypted.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  },
  decrypt(row) {
    const secret = process.env.STAFF_PASSPORT_KEY;
    if (!secret || !row?.passport_data_encrypted) return null;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), Buffer.from(row.passport_data_iv, 'base64'));
      decipher.setAuthTag(Buffer.from(row.passport_data_tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.passport_data_encrypted, 'base64')), decipher.final()]).toString('utf8'));
    } catch (_) { return null; }
  }
};const rolePermissions = {
  owner: ['floor', 'orders', 'reservations', 'inventory', 'finance', 'staff', 'staff_sensitive', 'settings'],
  admin: ['floor', 'orders', 'reservations', 'inventory', 'finance', 'staff', 'staff_view', 'staff_sensitive'],
  senior_bartender: ['floor', 'orders', 'bar_tasks'],
  senior_hookah_master: ['floor', 'orders', 'hookah_tasks'],
  bartender: ['floor', 'orders', 'bar_tasks'],
  hookah_master: ['floor', 'orders', 'hookah_tasks'],
  developer: ['floor', 'orders', 'reservations', 'inventory', 'finance', 'staff', 'settings', 'diagnostics']
};

const json = (res, status, data) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
  if (process.env.CORS_ORIGIN) headers['Access-Control-Allow-Origin'] = process.env.CORS_ORIGIN;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
};
const body = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
});
const normalizePhoneNumbers = (value) => { const seen = new Set(); const contacts = (Array.isArray(value) ? value : []).map((entry) => ({ label: String(entry?.label || 'Дополнительный').trim().slice(0, 32), number: String(entry?.number || '').trim(), primary: Boolean(entry?.primary) })).filter((entry) => entry.number && !seen.has(entry.number) && seen.add(entry.number)); if (contacts.length) { const primaryIndex = contacts.findIndex((entry) => entry.primary); contacts.forEach((entry, index) => { entry.primary = primaryIndex < 0 ? index === 0 : index === primaryIndex; }); } return contacts; };
const validEmploymentDate = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const orderTotal = (order) => order.items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
const approvedDiscountTotal = (orderId, subtotal) => discountRequests.filter((request) => request.orderId === orderId && request.status === 'approved').reduce((sum, request) => sum + (request.type === 'percent' ? subtotal * Math.min(100, Math.max(0, Number(request.value || 0))) / 100 : Math.max(0, Number(request.value || 0))), 0);
const orderNetTotal = (order) => Math.max(0, orderTotal(order) - approvedDiscountTotal(order.id, orderTotal(order)));
const orderStatusTransitions = { open: ['open', 'in_progress', 'cancelled'], in_progress: ['in_progress', 'ready', 'open', 'cancelled'], ready: ['ready', 'closed', 'in_progress', 'cancelled'], closed: ['closed'], cancelled: ['cancelled'] };
const validOrderTransition = (from, to) => Boolean(orderStatusTransitions[from]?.includes(to));
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
  if (memorySession) { if (Date.now() - memorySession.createdAt > 28_800_000) { sessions.delete(token); return null; } return memorySession; }
  if (sessionRepository) { try { const persisted = await sessionRepository.get(hashToken(token)); if (persisted) return { user: { id: persisted.userId, name: persisted.name, role: persisted.role, avatarUrl: persisted.avatarUrl || null, telegram: persisted.telegram || '', phoneNumbers: persisted.phoneNumbers || [] } }; } catch (_) {} }
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
  if (req.method === 'OPTIONS') { const headers = { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' }; if (process.env.CORS_ORIGIN) headers['Access-Control-Allow-Origin'] = process.env.CORS_ORIGIN; res.writeHead(204, headers); return res.end(); }
  if (pathname === '/api/login' && req.method === 'POST') {
    const input = await body(req);
    const loginKey = String(input.username || '').trim().toLowerCase() || 'anonymous';
    const attempt = loginAttempts.get(loginKey);
    if (attempt && attempt.blockedUntil > Date.now()) return json(res, 429, { error: 'too_many_login_attempts', retryAfter: Math.ceil((attempt.blockedUntil - Date.now()) / 1000) });
    let account = demoAccounts.find((entry) => entry.username === input.username && entry.password === input.password);
    if (!account) { const person = staff.find((entry) => entry.active && entry.login === input.username); if (person && await verifyPassword(input.password, person.passwordHash)) account = { username: person.login, id: person.id, name: person.name, role: person.role, avatarUrl: person.avatarUrl, telegram: person.telegram, phoneNumbers: person.phoneNumbers }; }
    if (!account && repositories?.pool) {
      try {
        let rows;
        try {
          ({ rows } = await repositories.pool.query('SELECT id,login,full_name AS name,role,pin_hash,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers" FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username]));
        } catch (_) {
          try { ({ rows } = await repositories.pool.query('SELECT id,login,full_name AS name,role,pin_hash,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers" FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username])); }
          catch (_) { ({ rows } = await repositories.pool.query('SELECT id,login,full_name AS name,role,pin_hash,avatar_url AS "avatarUrl" FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username])); }
        }
        const row = rows[0]; if (row && await verifyPassword(input.password, row.pin_hash)) account = { username: row.login, id: row.id, name: row.name, role: row.role, avatarUrl: row.avatarUrl, telegram: row.telegram || null, phoneNumbers: row.phoneNumbers || [] };
      } catch (_) {}
    }
    if (!account) { const current = loginAttempts.get(loginKey) || { count: 0, firstAt: Date.now() }; const withinWindow = Date.now() - current.firstAt < 60_000; const next = withinWindow ? { count: current.count + 1, firstAt: current.firstAt } : { count: 1, firstAt: Date.now() }; if (next.count >= 5) next.blockedUntil = Date.now() + 60_000; loginAttempts.set(loginKey, next); return json(res, next.blockedUntil ? 429 : 401, { error: next.blockedUntil ? 'too_many_login_attempts' : 'invalid_credentials', ...(next.blockedUntil ? { retryAfter: 60 } : {}) }); }
    loginAttempts.delete(loginKey);
    const token = crypto.randomBytes(32).toString('hex');
    const userId = account.id || (account.username === 'owner' ? '20000000-0000-0000-0000-000000000001' : '20000000-0000-0000-0000-000000000002');
    sessions.set(token, { user: { id: userId, name: account.name, role: account.role, avatarUrl: account.avatarUrl || null, telegram: account.telegram || '', phoneNumbers: account.phoneNumbers || [] }, createdAt: Date.now() });
    if (sessionRepository) { try { await sessionRepository.create({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 28_800_000).toISOString() }); } catch (_) {} }
    res.setHeader('Set-Cookie', `crm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
    return json(res, 200, { token, user: { id: userId, name: account.name, role: account.role, avatarUrl: account.avatarUrl || null, telegram: account.telegram || '', phoneNumbers: account.phoneNumbers || [] }, expiresIn: 28800 });
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
    if (repositories?.pool) { try {
      const { rows } = await repositories.pool.query('SELECT id,name,phone,address,logo_url AS "logoUrl",timezone FROM venues WHERE id=$1', [venueDbId]);
      if (rows[0]) { const { rows: vipRows } = await repositories.pool.query('SELECT name,min_order_total FROM tables WHERE venue_id=$1 AND name IN ($2,$3)', [venueDbId, 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 1', 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 2']); const vipRoomMinimums = { ...venue.vipRoomMinimums }; vipRows.forEach((row) => { if (row.name.endsWith('1')) vipRoomMinimums.vip_room_1 = Number(row.min_order_total); if (row.name.endsWith('2')) vipRoomMinimums.vip_room_2 = Number(row.min_order_total); }); venue.vipRoomMinimums = vipRoomMinimums; return json(res, 200, { ...venue, ...rows[0], vipRoomMinimums }); }
    } catch (_) {} }
    return json(res, 200, venue);
  }
  if (pathname === '/api/venue' && (req.method === 'PATCH' || req.method === 'PUT')) {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const before = { ...venue };
    if (input.phone !== undefined && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone))) return json(res, 400, { error: 'invalid_phone' });
    if (input.logoUrl !== undefined && input.logoUrl !== null && !validImageData(input.logoUrl)) return json(res, 400, { error: 'invalid_logo' });
    if (input.vipRoomMinimums !== undefined) {
      const values = input.vipRoomMinimums || {};
      for (const key of ['vip_room_1', 'vip_room_2']) if (values[key] !== undefined && (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0)) return json(res, 400, { error: 'invalid_vip_minimum' });
      venue.vipRoomMinimums = { ...venue.vipRoomMinimums, ...Object.fromEntries(['vip_room_1', 'vip_room_2'].filter((key) => values[key] !== undefined).map((key) => [key, Math.round(Number(values[key]))])) };
      floor.flatMap((zone) => zone.tables).forEach((table) => { if (table.id === 'vip-room-1') table.minimumOrderTotal = venue.vipRoomMinimums.vip_room_1; if (table.id === 'vip-room-2') table.minimumOrderTotal = venue.vipRoomMinimums.vip_room_2; });
      if (repositories?.pool) { try { await repositories.pool.query('UPDATE tables SET min_deposit=$1,min_order_total=$1 WHERE venue_id=$2 AND name=$3', [venue.vipRoomMinimums.vip_room_1, venueDbId, 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 1']); await repositories.pool.query('UPDATE tables SET min_deposit=$1,min_order_total=$1 WHERE venue_id=$2 AND name=$3', [venue.vipRoomMinimums.vip_room_2, venueDbId, 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 2']); } catch (_) {} }
    }
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
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'staff') && !hasPermission(req, 'settings') && !hasPermission(req, 'staff_view')) return json(res, 403, { error: 'forbidden', permission: 'staff' });
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes" FROM users WHERE venue_id=$1 ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows }); } catch (_) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers" FROM users WHERE venue_id=$1 ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows.map((row) => ({ ...row, employmentStartedAt: null, workNotes: '' })) }); } catch (_) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl" FROM users WHERE venue_id=$1 ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows.map((row) => ({ ...row, telegram: null, phoneNumbers: [], employmentStartedAt: null, workNotes: '' })) }); } catch (_) {} } } }
    return json(res, 200, { items: staff.map(({ passwordHash, ...person }) => { if (!hasPermission(req, 'staff_sensitive')) delete person.passportData; return person; }) });
  }
  if (pathname === '/api/staff' && req.method === 'POST') {
    if (denyUnless(req, res, 'staff')) return;
    const input = await body(req);
    if (!input.name || !rolePermissions[input.role]) return json(res, 400, { error: 'name_and_valid_role_required' });
    if (!validEmploymentDate(input.employmentStartedAt)) return json(res, 400, { error: 'invalid_employment_date' });
    if (input.workNotes !== undefined && String(input.workNotes).length > 4000) return json(res, 400, { error: 'work_notes_too_long' });
    if (input.telegram && !/^(@[A-Za-z0-9_]{5,32}|https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$)/.test(String(input.telegram).trim())) return json(res, 400, { error: 'invalid_telegram' });
    if (input.phoneNumbers !== undefined && (!Array.isArray(input.phoneNumbers) || input.phoneNumbers.length > 5 || input.phoneNumbers.some((entry) => !entry || !/^\+?[0-9 ()-]{7,24}$/.test(String(entry.number || '').trim())))) return json(res, 400, { error: 'invalid_phone_numbers' });
    const contactNumbers = normalizePhoneNumbers(input.phoneNumbers);
    if (contactNumbers.length && contactNumbers.filter((entry) => entry.primary).length !== 1) return json(res, 400, { error: 'one_primary_phone_required' });
    const createdPassport = input.passportData !== undefined ? staffPassportCipher.encrypt(input.passportData) : null;
    if (input.passportData !== undefined && !hasPermission(req, 'staff_sensitive')) return json(res, 403, { error: 'sensitive_staff_permission_required' });
    if (input.passportData !== undefined && !createdPassport) return json(res, 503, { error: 'staff_passport_key_required' });
    if (repositories?.pool) { try { const login = input.login || `user_${Date.now()}`; const passwordHash = input.password ? await hashPassword(input.password) : null; let rows; try { ({ rows } = await repositories.pool.query(`INSERT INTO users (venue_id,full_name,login,pin_hash,role,avatar_url,telegram_url,phone_numbers,employment_started_at,work_notes,passport_data_encrypted,passport_data_iv,passport_data_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) RETURNING id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes"`, [venueDbId, input.name, login, passwordHash, input.role, input.avatarUrl || null, input.telegram || null, JSON.stringify(contactNumbers), input.employmentStartedAt || null, String(input.workNotes || '').slice(0, 4000), createdPassport?.data || null, createdPassport?.iv || null, createdPassport?.tag || null])); } catch (_) { ({ rows } = await repositories.pool.query(`INSERT INTO users (venue_id,full_name,login,pin_hash,role,avatar_url,telegram_url,phone_numbers,passport_data_encrypted,passport_data_iv,passport_data_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) RETURNING id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers"`, [venueDbId, input.name, login, passwordHash, input.role, input.avatarUrl || null, input.telegram || null, JSON.stringify(contactNumbers), createdPassport?.data || null, createdPassport?.iv || null, createdPassport?.tag || null])); } const result = { ...rows[0], employmentStartedAt: input.employmentStartedAt || null, workNotes: String(input.workNotes || '').slice(0, 4000) }; recordAudit(req, 'staff.created', 'staff', rows[0].id, null, result); return json(res, 201, result); } catch (error) { return json(res, 409, { error: 'staff_create_failed', detail: error.message }); } }
    const person = { id: `u-${Date.now()}`, name: input.name, login: input.login || `user_${Date.now()}`, passwordHash: input.password ? await hashPassword(input.password) : null, role: input.role, active: true, avatarUrl: input.avatarUrl || null, telegram: input.telegram || null, phoneNumbers: contactNumbers, employmentStartedAt: input.employmentStartedAt || null, workNotes: String(input.workNotes || '').slice(0, 4000), passportData: input.passportData || null };
    staff.push(person);
    const { passwordHash, ...publicPerson } = person;
    recordAudit(req, 'staff.created', 'staff', person.id, null, publicPerson);
    return json(res, 201, publicPerson);
  }
  const staffStatus = pathname.match(/^\/api\/staff\/([^/]+)\/status$/);
  if (staffStatus && req.method === 'PATCH') {
    if (denyUnless(req, res, 'staff')) return;
    const input = await body(req); if (typeof input.active !== 'boolean') return json(res, 400, { error: 'active_boolean_required' });
    if (String(req.user?.id || '') === staffStatus[1] && !input.active) return json(res, 409, { error: 'self_deactivation_forbidden' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffStatus[1])) { try { const { rows } = await repositories.pool.query(`UPDATE users SET is_active=$1 WHERE id=$2 AND venue_id=$3 AND role <> 'owner' RETURNING id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl"`, [input.active, staffStatus[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'staff_not_found_or_owner' }); recordAudit(req, input.active ? 'staff.activated' : 'staff.deactivated', 'staff', rows[0].id, { active: !input.active }, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_status_update_failed', detail: error.message }); } }
    const person = staff.find((entry) => entry.id === staffStatus[1]); if (!person || person.role === 'owner') return json(res, 404, { error: 'staff_not_found_or_owner' }); const before = { active: person.active }; person.active = input.active; recordAudit(req, input.active ? 'staff.activated' : 'staff.deactivated', 'staff', person.id, before, { active: person.active }); return json(res, 200, person);
  }
  const staffDelete = pathname.match(/^\/api\/staff\/([^/]+)$/);
  if (staffDelete && req.method === 'DELETE') {
    if (denyUnless(req, res, 'staff')) return;
    if (String(req.user?.id || '') === staffDelete[1]) return json(res, 409, { error: 'self_deactivation_forbidden' });
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
const staffProfile = pathname.match(/^\/api\/staff\/([^/]+)\/profile$/);
if (staffProfile && req.method === 'GET') {
  const personId = staffProfile[1];
  const canRead = hasPermission(req, 'staff') || hasPermission(req, 'staff_view') || String(req.user?.id || '') === personId;
  if (!canRead) return json(res, 403, { error: 'forbidden', permission: 'staff_view' });
  if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(personId)) {
    try {
      const { rows } = await repositories.pool.query('SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes",passport_data_encrypted,passport_data_iv,passport_data_tag FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
      if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
      const profile = { ...rows[0] };
      if (hasPermission(req, 'staff_sensitive')) profile.passportData = staffPassportCipher.decrypt(rows[0]);
      delete profile.passport_data_encrypted; delete profile.passport_data_iv; delete profile.passport_data_tag;
      return json(res, 200, profile);
    } catch (error) {
      // Keep migration 002 contact data available when the employment migration is not applied yet.
      try {
        const { rows } = await repositories.pool.query('SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",passport_data_encrypted,passport_data_iv,passport_data_tag FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
        const profile = { ...rows[0], employmentStartedAt: null, workNotes: '' };
        if (hasPermission(req, 'staff_sensitive')) profile.passportData = staffPassportCipher.decrypt(rows[0]);
        delete profile.passport_data_encrypted; delete profile.passport_data_iv; delete profile.passport_data_tag;
        return json(res, 200, profile);
      } catch (_) {
        try {
          const { rows } = await repositories.pool.query('SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl" FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
          if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
          return json(res, 200, { ...rows[0], telegram: null, phoneNumbers: [], employmentStartedAt: null, workNotes: '' });
        } catch (fallbackError) { return json(res, 409, { error: 'staff_profile_read_failed', detail: fallbackError.message }); }
      }
    }
  }
  const person = staff.find((entry) => entry.id === personId);
  if (!person) return json(res, 404, { error: 'staff_not_found' });
  const profile = { ...person }; if (!hasPermission(req, 'staff_sensitive')) delete profile.passportData;
  return json(res, 200, profile);
}
if (staffProfile && req.method === 'PATCH') {
  const personId = staffProfile[1];
  const canManage = hasPermission(req, 'staff') || hasPermission(req, 'staff_view');
  const canManageSensitive = hasPermission(req, 'staff_sensitive');
  const isSelf = String(req.user?.id || '') === personId;
  if (!canManage && !isSelf) return json(res, 403, { error: 'forbidden', permission: 'staff' });
  const input = await body(req);
  const memoryPerson = staff.find((entry) => entry.id === personId);
  let before = memoryPerson ? { ...memoryPerson, phoneNumbers: Array.isArray(memoryPerson.phoneNumbers) ? memoryPerson.phoneNumbers.map((phone) => ({ ...phone })) : [] } : null;
  if (!before && repositories?.pool && /^[0-9a-f-]{36}$/i.test(personId)) {
    try {
      const { rows } = await repositories.pool.query('SELECT id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes" FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
      before = rows[0] || null;
    } catch (_) {}
  }
  if (!before) return json(res, 404, { error: 'staff_not_found' });
  const auditBefore = { ...before, phoneNumbers: Array.isArray(before.phoneNumbers) ? before.phoneNumbers.map((phone) => ({ ...phone })) : [] };
  if (!canManageSensitive) delete auditBefore.passportData;
  if (input.name !== undefined && !canManage) return json(res, 403, { error: 'staff_management_required' });
  if (input.role !== undefined && !canManage) return json(res, 403, { error: 'staff_management_required' });
  if (input.name !== undefined && (!String(input.name).trim() || String(input.name).trim().length > 120)) return json(res, 400, { error: 'invalid_staff_name' });
  if (input.role !== undefined && (!rolePermissions[input.role] || input.role === 'owner')) return json(res, 400, { error: 'invalid_staff_role' });
  if (input.employmentStartedAt !== undefined && !canManage) return json(res, 403, { error: 'staff_management_required' });
  if (input.workNotes !== undefined && !canManage) return json(res, 403, { error: 'staff_management_required' });
  if (input.employmentStartedAt !== undefined && !validEmploymentDate(input.employmentStartedAt)) return json(res, 400, { error: 'invalid_employment_date' });
  if (input.workNotes !== undefined && String(input.workNotes).length > 4000) return json(res, 400, { error: 'work_notes_too_long' });
  if (input.telegram !== undefined && input.telegram && !/^(@[A-Za-z0-9_]{5,32}|https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$)/.test(String(input.telegram).trim())) return json(res, 400, { error: 'invalid_telegram' });
  if (input.phoneNumbers !== undefined && (!Array.isArray(input.phoneNumbers) || input.phoneNumbers.length > 5 || input.phoneNumbers.some((entry) => !entry || !/^\+?[0-9 ()-]{7,24}$/.test(String(entry.number || '').trim())))) return json(res, 400, { error: 'invalid_phone_numbers' });
  if (input.passportData !== undefined && !canManageSensitive) return json(res, 403, { error: 'sensitive_staff_permission_required' });
  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl && !validImageData(input.avatarUrl)) return json(res, 400, { error: 'invalid_avatar' });
    before.avatarUrl = input.avatarUrl || null;
  }
  if (input.name !== undefined) before.name = String(input.name).trim();
  if (input.role !== undefined) before.role = input.role;
  if (input.telegram !== undefined) before.telegram = String(input.telegram || '').trim();
  if (input.employmentStartedAt !== undefined) before.employmentStartedAt = input.employmentStartedAt || null;
  if (input.workNotes !== undefined) before.workNotes = String(input.workNotes || '').slice(0, 4000);
  let contactJson = null;
  if (input.phoneNumbers !== undefined) {
    const contacts = normalizePhoneNumbers(input.phoneNumbers);
    if (contacts.length && contacts.filter((entry) => entry.primary).length !== 1) return json(res, 400, { error: 'one_primary_phone_required' });
    before.phoneNumbers = contacts;
    contactJson = JSON.stringify(contacts);
  }
  if (input.passportData !== undefined) before.passportData = input.passportData || null;
  const encryptedPassport = input.passportData !== undefined && canManageSensitive ? staffPassportCipher.encrypt(input.passportData) : null;
  if (input.passportData !== undefined && repositories?.pool && canManageSensitive && !encryptedPassport) return json(res, 503, { error: 'staff_passport_key_required' });
  if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(personId)) {
    try {
      try { await repositories.pool.query('UPDATE users SET avatar_url=CASE WHEN $1 THEN $2 ELSE avatar_url END,telegram_url=CASE WHEN $3 THEN $4 ELSE telegram_url END,phone_numbers=CASE WHEN $5 THEN $6::jsonb ELSE phone_numbers END,employment_started_at=CASE WHEN $7 THEN $8::date ELSE employment_started_at END,work_notes=CASE WHEN $9 THEN $10 ELSE work_notes END,passport_data_encrypted=COALESCE($11,passport_data_encrypted),passport_data_iv=COALESCE($12,passport_data_iv),passport_data_tag=COALESCE($13,passport_data_tag),full_name=CASE WHEN $14 THEN $15 ELSE full_name END,role=CASE WHEN $16 THEN $17 ELSE role END WHERE id=$18 AND venue_id=$19', [input.avatarUrl !== undefined, input.avatarUrl || null, input.telegram !== undefined, input.telegram !== undefined ? (input.telegram || null) : null, input.phoneNumbers !== undefined, contactJson || '[]', input.employmentStartedAt !== undefined, input.employmentStartedAt || null, input.workNotes !== undefined, input.workNotes !== undefined ? String(input.workNotes || '').slice(0, 4000) : null, encryptedPassport?.data || null, encryptedPassport?.iv || null, encryptedPassport?.tag || null, input.name !== undefined, before.name, input.role !== undefined, before.role, personId, venueDbId]); } catch (_) {
        await repositories.pool.query('UPDATE users SET avatar_url=CASE WHEN $1 THEN $2 ELSE avatar_url END,telegram_url=CASE WHEN $3 THEN $4 ELSE telegram_url END,phone_numbers=CASE WHEN $5 THEN $6::jsonb ELSE phone_numbers END,passport_data_encrypted=COALESCE($7,passport_data_encrypted),passport_data_iv=COALESCE($8,passport_data_iv),passport_data_tag=COALESCE($9,passport_data_tag),full_name=CASE WHEN $10 THEN $11 ELSE full_name END,role=CASE WHEN $12 THEN $13 ELSE role END WHERE id=$14 AND venue_id=$15', [input.avatarUrl !== undefined, input.avatarUrl || null, input.telegram !== undefined, input.telegram !== undefined ? (input.telegram || null) : null, input.phoneNumbers !== undefined, contactJson || '[]', encryptedPassport?.data || null, encryptedPassport?.iv || null, encryptedPassport?.tag || null, input.name !== undefined, before.name, input.role !== undefined, before.role, personId, venueDbId]);
      }
    } catch (error) { return json(res, 409, { error: 'staff_profile_save_failed', detail: error.message }); }
  }
  if (memoryPerson) Object.assign(memoryPerson, before);
  const publicPerson = { ...before };
  if (!canManageSensitive) delete publicPerson.passportData;
  recordAudit(req, 'staff.profile_updated', 'staff', before.id, auditBefore, publicPerson);
  return json(res, 200, publicPerson);
}if (pathname === '/api/inventory' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'inventory') && !hasPermission(req, 'inventory_read')) return json(res, 403, { error: 'forbidden', permission: 'inventory' });
    if (repositories?.inventory) { try { const data = await repositories.inventory.list(venueDbId); return json(res, 200, { ...data, lowStock: data.items.filter((item) => item.onHand <= item.minLevel) }); } catch (_) {} }
    return json(res, 200, { items: inventory, lowStock: inventory.filter((item) => item.onHand <= item.minLevel), movements: stockMovements.slice(-20).reverse() });
  }
  if (pathname === '/api/inventory/movements' && req.method === 'POST') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req);
    if (input.reason !== undefined && String(input.reason).length > 200) return json(res, 400, { error: 'movement_reason_too_long' });
    input.reason = String(input.reason || 'Корректировка').trim().slice(0, 200);
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
    const movement = { id: `mov-${Date.now()}`, itemId: item.id, itemName: item.name, delta, reason: input.reason, createdAt: new Date().toISOString() };
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
    if (String(input.guestName).trim().length > 120) return json(res, 400, { error: 'guest_name_too_long' });
    if (input.notes !== undefined && String(input.notes).length > 2000) return json(res, 400, { error: 'reservation_notes_too_long' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) || !/^\d{2}:\d{2}$/.test(String(input.time)) || Number.isNaN(Date.parse(`${input.date}T${input.time}:00`))) return json(res, 400, { error: 'invalid_reservation_datetime' });
    if (input.phone && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone).trim())) return json(res, 400, { error: 'invalid_guest_phone' });
    if (!Number.isInteger(Number(input.guests || 1)) || Number(input.guests || 1) < 1 || Number(input.guests || 1) > 50) return json(res, 400, { error: 'invalid_guest_count' });
    let tableMinimum = 0;
    let tableName = input.tableId;
    let table = null;
    if (repositories?.pool) {
      try {
        const { rows } = await repositories.pool.query('SELECT name,min_order_total AS "minimumOrderTotal" FROM tables WHERE id=$1 AND venue_id=$2', [input.tableId, venueDbId]);
        if (!rows[0]) return json(res, 400, { error: 'table_not_found' });
        tableName = rows[0].name;
        tableMinimum = Number(rows[0].minimumOrderTotal || 0);
      } catch (error) { return json(res, 409, { error: 'reservation_table_lookup_failed', detail: error.message }); }
    } else {
      table = floor.flatMap((zone) => zone.tables).find((entry) => entry.id === input.tableId);
      if (!table) return json(res, 400, { error: 'table_not_found' });
      tableName = table.name;
      tableMinimum = Number(table.minimumOrderTotal || 0);
    }
    const deposit = Number(input.deposit || 0);
    if (!Number.isFinite(deposit) || deposit < tableMinimum) return json(res, 409, { error: 'vip_deposit_below_minimum', requiredDeposit: tableMinimum, providedDeposit: deposit });
    if (repositories?.pool) {
      try {
        const conflict = await repositories.pool.query(`SELECT id FROM reservations WHERE venue_id=$1 AND table_id=$2 AND starts_at=$3::timestamptz AND status='confirmed' LIMIT 1`, [venueDbId, input.tableId, `${input.date}T${input.time}:00`]);
        if (conflict.rows[0]) return json(res, 409, { error: 'table_already_reserved', reservationId: conflict.rows[0].id });
      } catch (error) { return json(res, 409, { error: 'reservation_conflict_check_failed', detail: error.message }); }
    } else if (reservations.some((entry) => entry.status === 'confirmed' && entry.tableId === input.tableId && entry.date === input.date && entry.time === input.time)) {
      return json(res, 409, { error: 'table_already_reserved' });
    }
    if (repositories?.pool) { try { const reservation = await repositories.reservations.create({ ...input, deposit, venueId: venueDbId }); recordAudit(req, 'reservation.created', 'reservation', reservation.id, null, reservation); return json(res, 201, reservation); } catch (error) { return json(res, 409, { error: 'reservation_create_failed', detail: error.message }); } }
    const reservation = { id: `res-${Date.now()}`, guestName: input.guestName, phone: input.phone || '', date: input.date, time: input.time, tableId: input.tableId, tableName, guests: Number(input.guests || 1), status: 'confirmed', deposit, notes: input.notes || '' };
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
    if (!input.tableId || typeof input.tableId !== 'string' || input.tableId.length > 80) return json(res, 400, { error: 'table_id_required' });
    const minimumOrderTotal = Number(input.minimumOrderTotal || 0);
    if (!Number.isFinite(minimumOrderTotal) || minimumOrderTotal < 0) return json(res, 400, { error: 'invalid_vip_minimum' });
    if (repositories?.orders) {
      try {
        const openedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001';
        const persisted = await repositories.orders.create({ venueId: venueDbId, tableId: input.tableId, openedBy, reservationId: input.reservationId, vipMinimum: minimumOrderTotal, notes: input.notes });
        recordAudit(req, 'order.created', 'order', persisted.id, null, persisted);
        return json(res, 201, { ...persisted, items: [] });
      } catch (error) { return json(res, 409, { error: 'order_create_failed', detail: error.message }); }
    }
    const order = { id: `ord-${Date.now()}`, tableId: input.tableId || null, status: 'open', orderType: input.orderType || 'regular', minimumOrderTotal, notes: input.notes || '', items: [], createdAt: new Date().toISOString() };
    orders.push(order);
    recordAudit(req, 'order.created', 'order', order.id, null, order);
    return json(res, 201, order);
  }
  const orderEdit = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderEdit && req.method === 'PATCH') {
    if (denyUnless(req, res, 'orders')) return;
    const input = await body(req); if (input.notes === undefined && input.guestName === undefined && input.phone === undefined) return json(res, 400, { error: 'supported_fields_required' });
    if (input.phone !== undefined && input.phone && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone).trim())) return json(res, 400, { error: 'invalid_guest_phone' });
    if (input.guestName !== undefined && String(input.guestName).trim().length > 120) return json(res, 400, { error: 'guest_name_too_long' });
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
           const { rows: currentRows } = await repositories.pool.query('SELECT id,status FROM orders WHERE id=$1 AND venue_id=$2', [orderAction[1], venueDbId]);
           if (!currentRows[0]) return json(res, 404, { error: 'order_not_found' });
           if (!validOrderTransition(currentRows[0].status, input.status)) return json(res, 409, { error: 'invalid_order_transition', from: currentRows[0].status, to: input.status });
           const { rows } = await repositories.pool.query('UPDATE orders SET status=$1,closed_at=CASE WHEN $1=\'closed\' THEN now() ELSE closed_at END WHERE id=$2 AND venue_id=$3 RETURNING id,status,table_id AS "tableId"', [input.status, orderAction[1], venueDbId]);
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
       if (!validOrderTransition(order.status, input.status)) return json(res, 409, { error: 'invalid_order_transition', from: order.status, to: input.status });
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
      const input = await body(req); const quantity = Number(input.quantity || 1); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' });
      try { const { rows: productRows } = await repositories.pool.query('SELECT id,name,sale_price AS "unitPrice",category AS station FROM products WHERE id=$1 AND venue_id=$2 AND is_active=true', [input.productId, venueDbId]); const product = productRows[0]; if (!product) return json(res, 400, { error: 'product_not_found' }); const { rows } = await repositories.pool.query('INSERT INTO order_items (order_id,product_id,quantity,unit_price,station) VALUES ($1,$2,$3,$4,$5) RETURNING id,product_id AS "productId",quantity,unit_price AS "unitPrice",station', [itemMatch[1], product.id, quantity, product.unitPrice, product.station]); const result = { ...rows[0], name: product.name }; recordAudit(req, 'order.item_added', 'order_item', rows[0].id, null, result); return json(res, 201, result); } catch (error) { return json(res, 409, { error: 'order_item_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === itemMatch[1]);
    const input = await body(req); const quantity = Number(input.quantity || 1);
    const product = products.find((entry) => entry.id === input.productId);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (!product) return json(res, 400, { error: 'product_not_found' });
    if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' });
    const item = { id: `item-${Date.now()}`, productId: product.id, name: product.name, quantity, unitPrice: product.price, station: product.station };
    order.items.push(item);
    recordAudit(req, 'order.item_added', 'order_item', item.id, null, item);
    return json(res, 201, item);
  }
  const itemAction = pathname.match(/^\/api\/orders\/([^/]+)\/items\/([^/]+)$/);
  if (itemAction && (req.method === 'PATCH' || req.method === 'DELETE')) {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(itemAction[1]) && /^[0-9a-f-]{36}$/i.test(itemAction[2])) {
      try {
        if (req.method === 'DELETE') { const { rows } = await repositories.pool.query('DELETE FROM order_items WHERE id=$1 AND order_id=$2 RETURNING id,quantity,unit_price AS "unitPrice"', [itemAction[2], itemAction[1]]); if (!rows[0]) return json(res, 404, { error: 'order_item_not_found' }); recordAudit(req, 'order.item_removed', 'order_item', rows[0].id, rows[0], null); return json(res, 200, rows[0]); }
        const input = await body(req); const quantity = Number(input.quantity); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' }); const { rows } = await repositories.pool.query('UPDATE order_items SET quantity=$1 WHERE id=$2 AND order_id=$3 RETURNING id,quantity,unit_price AS "unitPrice"', [quantity, itemAction[2], itemAction[1]]); if (!rows[0]) return json(res, 404, { error: 'order_item_not_found' }); recordAudit(req, 'order.item_quantity_changed', 'order_item', rows[0].id, null, rows[0]); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_item_update_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === itemAction[1]); const item = order?.items?.find((entry) => entry.id === itemAction[2]); if (!item) return json(res, 404, { error: 'order_item_not_found' });
    if (req.method === 'DELETE') { order.items = order.items.filter((entry) => entry.id !== item.id); recordAudit(req, 'order.item_removed', 'order_item', item.id, item, null); return json(res, 200, { id: item.id }); }
    const input = await body(req); const quantity = Number(input.quantity); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' }); const beforeQuantity = item.quantity; item.quantity = quantity; recordAudit(req, 'order.item_quantity_changed', 'order_item', item.id, { quantity: beforeQuantity }, item); return json(res, 200, item);
  }
  const paymentPath = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);
  if (paymentPath && (req.method === 'GET' || req.method === 'POST')) {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(paymentPath[1])) {
      try {
        const { rows: orderRows } = await repositories.pool.query('SELECT id,status,vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [paymentPath[1], venueDbId]);
        const persisted = orderRows[0]; if (!persisted) return json(res, 404, { error: 'order_not_found' }); if (req.method === 'POST' && (persisted.status === 'closed' || persisted.status === 'cancelled')) return json(res, 409, { error: 'order_already_final' });
        const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [paymentPath[1]]);
        const subtotal = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); const { rows: discountRows } = await repositories.pool.query('SELECT type,value FROM discounts WHERE order_id=$1 AND status=\'approved\'', [paymentPath[1]]); const discount = discountRows.reduce((sum, item) => sum + (item.type === 'percent' ? subtotal * Math.min(100, Math.max(0, Number(item.value || 0))) / 100 : Math.max(0, Number(item.value || 0))), 0); const due = Math.max(subtotal - discount, Number(persisted.minimumOrderTotal || 0));
        if (req.method === 'GET') { const { rows } = await repositories.pool.query('SELECT id,method,amount,status,created_at AS "createdAt" FROM payments WHERE order_id=$1 ORDER BY created_at', [paymentPath[1]]); return json(res, 200, { items: rows, due, paid: rows.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0), remaining: Math.max(0, due - rows.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0)) }); }
        const input = await body(req); const amount = Number(input.amount); const method = String(input.method || 'cash'); if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'card', 'qr'].includes(method)) return json(res, 400, { error: 'valid_method_and_amount_required' });
        const { rows: paidRows } = await repositories.pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND status=\'paid\'', [paymentPath[1]]); const paid = Number(paidRows[0]?.paid || 0); if (paid + amount > due + 0.01) return json(res, 409, { error: 'payment_exceeds_due', remaining: Math.max(0, due - paid) });
        const { rows } = await repositories.pool.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,\'paid\') RETURNING id,method,amount,status,created_at AS "createdAt"', [paymentPath[1], method, amount]); const nextPaid = paid + amount; if (nextPaid >= due) await repositories.pool.query('UPDATE orders SET status=\'closed\',closed_at=now() WHERE id=$1', [paymentPath[1]]); recordAudit(req, 'order.payment_added', 'payment', rows[0].id, null, rows[0]); return json(res, 201, { ...rows[0], due, paid: nextPaid, remaining: Math.max(0, due - nextPaid), closed: nextPaid >= due });
      } catch (error) { return json(res, 409, { error: 'payment_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === paymentPath[1]); if (!order) return json(res, 404, { error: 'order_not_found' }); if (req.method === 'POST' && (order.status === 'closed' || order.status === 'cancelled')) return json(res, 409, { error: 'order_already_final' }); order.payments ||= []; const subtotal = orderTotal(order); const discount = approvedDiscountTotal(order.id, subtotal); const due = Math.max(subtotal - discount, Number(order.minimumOrderTotal || 0)); const paid = order.payments.reduce((sum, item) => sum + Number(item.amount), 0);
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
      const input = await body(req); const paymentMethod = String(input.paymentMethod || 'cash'); if (!['cash', 'card', 'qr'].includes(paymentMethod)) return json(res, 400, { error: 'valid_payment_method_required' });
      try { const { rows: orderRows } = await repositories.pool.query('SELECT id,status,vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [orderPath[1], venueDbId]); const persisted = orderRows[0]; if (!persisted) return json(res, 404, { error: 'order_not_found' }); if (['closed', 'cancelled'].includes(persisted.status)) return json(res, 409, { error: 'order_already_final' }); const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [orderPath[1]]); const subtotal = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); const { rows: discountRows } = await repositories.pool.query('SELECT type,value FROM discounts WHERE order_id=$1 AND status=\'approved\'', [orderPath[1]]); const discount = discountRows.reduce((sum, item) => sum + (item.type === 'percent' ? subtotal * Math.min(100, Math.max(0, Number(item.value || 0))) / 100 : Math.max(0, Number(item.value || 0))), 0); const minimum = Number(persisted.minimumOrderTotal || 0); const finalTotal = Math.max(subtotal - discount, minimum); const { rows: paidRows } = await repositories.pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND status=\'paid\'', [orderPath[1]]); const paid = Number(paidRows[0]?.paid || 0); const remaining = Math.max(0, finalTotal - paid); const { rows } = await repositories.pool.query('UPDATE orders SET status=$1,closed_at=now() WHERE id=$2 AND venue_id=$3 AND status NOT IN (\'closed\',\'cancelled\') RETURNING *', ['closed', orderPath[1], venueDbId]); if (!rows[0]) return json(res, 409, { error: 'order_already_final' }); if (remaining > 0) await repositories.pool.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,$4)', [orderPath[1], paymentMethod, remaining, 'paid']); const result = { ...rows[0], subtotal, discountTotal: discount, finalTotal, paid: paid + remaining, remaining: 0, minimumAdjustment: Math.max(0, minimum - (subtotal - discount)), paymentMethod }; recordAudit(req, 'order.closed', 'order', orderPath[1], { status: persisted.status }, result); return json(res, 200, result); } catch (error) { return json(res, 409, { error: 'order_close_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (['closed', 'cancelled'].includes(order.status)) return json(res, 409, { error: 'order_already_final' });
    const input = await body(req); const paymentMethod = String(input.paymentMethod || 'cash'); if (!['cash', 'card', 'qr'].includes(paymentMethod)) return json(res, 400, { error: 'valid_payment_method_required' });
    const total = orderTotal(order); const discount = approvedDiscountTotal(order.id, total); const minimum = Number(order.minimumOrderTotal || 0);
    order.status = 'closed'; order.closedAt = new Date().toISOString(); order.subtotal = total; order.discountTotal = discount; order.finalTotal = Math.max(total - discount, minimum); order.payments ||= []; const alreadyPaid = order.payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0); const remaining = Math.max(0, order.finalTotal - alreadyPaid); if (remaining > 0) order.payments.push({ id: `pay-${Date.now()}`, method: paymentMethod, amount: remaining, status: 'paid', createdAt: order.closedAt }); order.paid = alreadyPaid + remaining; order.remaining = 0; order.minimumAdjustment = Math.max(0, minimum - (total - discount)); order.paymentMethod = paymentMethod;
    recordAudit(req, 'order.closed', 'order', order.id, { status: 'open' }, { status: order.status, subtotal: order.subtotal, discountTotal: order.discountTotal, finalTotal: order.finalTotal, minimumAdjustment: order.minimumAdjustment, paymentMethod: order.paymentMethod });
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
        const { rows: targetRows } = await client.query('INSERT INTO orders (venue_id,table_id,reservation_id,opened_by,vip_minimum,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,venue_id AS "venueId",table_id AS "tableId",reservation_id AS "reservationId",status,vip_minimum AS "minimumOrderTotal",created_at AS "createdAt"', [source.venue_id, source.table_id, source.reservation_id, source.opened_by, 0, 'open']);
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
      const input = await body(req); const type = String(input.type || 'percent'); const value = Number(input.value); const reason = String(input.reason || '').trim(); if (!reason || !Number.isFinite(value) || value <= 0 || !['percent', 'fixed'].includes(type) || (type === 'percent' && value > 100) || reason.length > 500) return json(res, 400, { error: 'invalid_discount_request' });
      try { const requestedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001'; const { rows } = await repositories.pool.query('INSERT INTO discounts (order_id,requested_by,type,value,reason) SELECT id,$2,$3,$4,$5 FROM orders WHERE id=$1 AND venue_id=$6 RETURNING id,order_id AS "orderId",type,value,reason,status,requested_by AS "requestedBy",created_at AS "createdAt"', [orderPath[1], requestedBy, type, value, reason, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'order_not_found' }); recordAudit(req, 'discount.requested', 'discount', rows[0].id, null, rows[0]); return json(res, 201, rows[0]); } catch (error) { return json(res, 409, { error: 'discount_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]); const input = await body(req);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    const type = String(input.type || 'percent'); const value = Number(input.value); const reason = String(input.reason || '').trim(); if (!reason || !Number.isFinite(value) || value <= 0 || !['percent', 'fixed'].includes(type) || (type === 'percent' && value > 100) || reason.length > 500) return json(res, 400, { error: 'invalid_discount_request' });
    const request = { id: `disc-${Date.now()}`, orderId: order.id, type, value, reason, guestName: order.guestName || null, guestPhone: order.guestPhone || null, status: 'requested', requestedBy: input.requestedBy || req.user?.name || 'unknown', createdAt: new Date().toISOString() };
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
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  return res.end(fs.readFileSync(file));
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) { const result = await api(req, res); if (result !== null) return result; }
    return staticFile(req, res);
  } catch (error) { return json(res, 500, { error: 'internal_error', message: error.message }); }
}).listen(process.env.PORT || 3000, () => console.log(`CRM running on http://localhost:${process.env.PORT || 3000}`));

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRepositories } = require('./db');
const scryptAsync = require('util').promisify(crypto.scrypt);
const catalogSeed = require('./catalog-seed');

const root = __dirname;
// Local development convenience: load ignored .env without adding a runtime dependency.
try {
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch (_) {}
const repositories = createRepositories();
const orderRepository = repositories?.orders || null;
const sessionRepository = repositories?.sessions || null;
// The selected network point is process-wide for the current local POS server.
// It starts from VENUE_ID and is updated by the network selector so subsequent
// floor, orders, inventory and reporting requests use the selected point.
let venueDbId = process.env.VENUE_ID || '00000000-0000-0000-0000-000000000001';
const venue = {
  id: 'venue-territory', name: 'Территория', format: 'кальян-бар', city: 'Тюмень',
  address: 'ул. Пермякова, 77, этаж -1', phone: '+7 (996) 641-95-10', logoUrl: null,
  timezone: 'Asia/Yekaterinburg', vipRoomMinimums: { vip_room_1: 1500, vip_room_2: 2500 }
};
const integrations = {
  egais: { enabled: false, status: 'planned' },
  honestMark: { enabled: false, status: 'planned' },
  chestnyZnak: { enabled: false, status: 'planned' },
  kkt: { enabled: false, status: 'planned' },
  ofd: { enabled: false, status: 'planned' },
  payments: { enabled: false, status: 'planned' },
  telegram: { enabled: false, status: 'planned' }
};
const networkVenues = [{ id: venue.id, name: venue.name, format: venue.format, city: venue.city, address: venue.address, phone: venue.phone, timezone: venue.timezone, status: 'active', isCurrent: true }];
let currentVenueId = venue.id;
const saasAccount = { id: 'org-territory', name: 'Территория', slug: 'territory', plan: 'starter', subscriptionStatus: 'trialing', seatsLimit: 5, venuesLimit: 1 };
const saasPlans = { starter: { name: 'Starter', monthlyPrice: 0, seatsLimit: 5, venuesLimit: 1, description: 'Для первого тестового заведения' }, growth: { name: 'Growth', monthlyPrice: 0, seatsLimit: 15, venuesLimit: 3, description: 'Для растущей команды' }, network: { name: 'Network', monthlyPrice: 0, seatsLimit: 50, venuesLimit: 10, description: 'Для сети заведений' }, enterprise: { name: 'Enterprise', monthlyPrice: 0, seatsLimit: 9999, venuesLimit: 9999, description: 'Индивидуальные лимиты' } };
const saasOrganizations = [{ id: 'org-territory', name: 'Территория', slug: 'territory', plan: 'starter', status: 'trialing', city: 'Тюмень', venues: 1, seats: 2, seatsLimit: 5, venuesLimit: 1, monthlyPrice: 0, createdAt: '2026-09-16T00:00:00.000Z', isActive: true }];
const products = [
  { id: 'hookah-darkside', name: 'Кальян — Darkside Blueberry', price: 1200, station: 'hookah', aliases: ['кальян', 'darkside', 'blueberry'], imageUrl: null },
  { id: 'lemonade-maracuya', name: 'Лимонад Маракуйя', price: 300, station: 'bar', aliases: ['лимонад', 'маракуйя', 'maracuya'], imageUrl: null },
  { id: 'redbull', name: 'Red Bull', price: 250, station: 'bar', aliases: ['red bull', 'ред булл', 'энергетик'], imageUrl: null },
  { id: 'tea-earl-grey', name: 'Чай Эрл Грей', price: 300, station: 'bar', aliases: ['чай', 'earl grey'], imageUrl: null },
  { id: 'clay-bowl', name: 'Чаша глиняная', price: 500, station: 'hookah', aliases: ['чаша'], imageUrl: null },
  { id: 'coco-nara', name: 'Уголь Coco Nara', price: 600, station: 'hookah', aliases: ['уголь', 'coco nara'], imageUrl: null },
  { id: 'energy-tiger', name: 'Tiger Energy', price: 220, station: 'bar', aliases: ['тигр', 'энергетик tiger'], imageUrl: 'data:image/png;base64,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' },
  { id: 'lemonade-berry', name: 'Лимонад Лесные ягоды', price: 320, station: 'bar', aliases: ['ягоды', 'лесные ягоды', 'лимонад'], imageUrl: 'data:image/png;base64,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' },
  { id: 'hookah-mint', name: 'Кальян — Mint Mix', price: 1100, station: 'hookah', aliases: ['кальян', 'мята', 'mint'], imageUrl: 'data:image/png;base64,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' }
];
products.forEach((product) => { product.category = product.category || (product.station === 'bar' ? 'Бар' : 'Кальянная зона'); });
products.push(...catalogSeed.products);
const productCategories = [
  { id: 'product-category-bar', name: 'Бар', active: true },
  { id: 'product-category-hookah', name: 'Кальянная зона', active: true },
  { id: 'product-category-kitchen', name: 'Кухня', active: true },
  { id: 'product-category-fridge', name: 'Холодильник', active: true }
];
const importedProductCategoryNames = [...new Set(catalogSeed.products.map((item) => String(item.category || '').trim()).filter(Boolean))];
for (const name of importedProductCategoryNames) if (!productCategories.some((item) => item.name === name)) productCategories.push({ id: 'seed-category-' + name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').slice(0, 32), name, active: true });
const floor = [
  { id: 'hall', name: 'Зал', tables: Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return { id: `table-${n}`, name: `Стол ${n}`, status: n === 8 || [2, 6, 11].includes(n) ? 'occupied' : [4, 9].includes(n) ? 'reserved' : 'free', capacity: 2, minimumOrderTotal: 0, layout: {} };
  }) },
  { id: 'vip', name: 'VIP-комнаты', tables: [
    { id: 'vip-room-1', name: 'VIP-комната 1', status: 'free', capacity: 4, minimumOrderTotal: 1500, layout: {} },
    { id: 'vip-room-2', name: 'VIP-комната 2', status: 'free', capacity: 6, minimumOrderTotal: 2500, layout: {} }
  ] }
];
const orders = [];
const discountRequests = [];
const staff = [
  { id: 'u-owner', name: 'Владелец', role: 'owner', active: true, avatarUrl: null, telegram: '', phoneNumbers: [], passportData: null, permissionScopes: [] },
  { id: 'u-maria', name: 'Мария', role: 'bartender', active: true, avatarUrl: null, telegram: '', phoneNumbers: [], passportData: null, permissionScopes: [] }
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
const deliveries = [];
const financeCategories = [
  { id: 'finance-kitchen', name: 'Кухня', kind: 'income', active: true },
  { id: 'finance-bar', name: 'Бар', kind: 'income', active: true },
  { id: 'finance-hookah', name: 'Кальяны', kind: 'income', active: true },
  { id: 'finance-stock', name: 'Склад', kind: 'expense', active: true },
  { id: 'finance-delivery', name: 'Доставка', kind: 'expense', active: true }
];
const auditEvents = [];
const staffNotifications = [];
const clients = [
  { id: 'client-anna', name: 'Анна Смирнова', phoneNumbers: [{ label: 'Основной', number: '+79991112233', primary: true }], telegram: '@anna_sm', tobaccoPreferences: ['Darkside', 'Мята'], bowlPreferences: ['Кальянная чаша'], barPreferences: ['Лимонад маракуйя', 'Red Bull'], allergies: '', notes: 'Предпочитает среднюю крепость', loyaltyPoints: 420, visits: 6, totalSpent: 18400, lastVisitAt: '2026-09-18T21:30:00.000Z' },
  { id: 'client-igor', name: 'Игорь Волков', phoneNumbers: [{ label: 'Основной', number: '+79994445566', primary: true }, { label: 'Рабочий', number: '+79997778899', primary: false }], telegram: '', tobaccoPreferences: ['Tangiers', 'Ягодные миксы'], bowlPreferences: ['Калауд'], barPreferences: ['Кола', 'Виски'], allergies: 'Орехи', notes: '', loyaltyPoints: 180, visits: 3, totalSpent: 9200, lastVisitAt: '2026-09-12T20:10:00.000Z' }
];
const sessions = new Map();
const loginAttempts = new Map();
const shifts = [];
const provisionedAccounts = [];
const demoAccounts = [
  { username: 'admin', venueId: '00000000-0000-0000-0000-000000000001', password: process.env.DEMO_ADMIN_PASSWORD || (process.env.AUTH_REQUIRED === 'true' ? '' : 'admin'), name: 'Александр', role: 'admin', organizationId: '00000000-0000-0000-0000-000000000010' },
  { username: 'owner', venueId: '00000000-0000-0000-0000-000000000001', password: process.env.DEMO_OWNER_PASSWORD || 'demo', name: 'Владелец', role: 'owner', organizationId: '00000000-0000-0000-0000-000000000010' },
  { username: 'staff', venueId: '00000000-0000-0000-0000-000000000001', password: process.env.DEMO_STAFF_PASSWORD || 'demo', pin: process.env.DEMO_STAFF_PIN || (process.env.AUTH_REQUIRED === 'true' ? '' : '1234'), name: 'Мария', role: 'bartender', organizationId: '00000000-0000-0000-0000-000000000010' },
  { username: process.env.SAAS_OWNER_EMAIL || 'alphasat72@gmail.com', password: process.env.SAAS_OWNER_PASSWORD || (process.env.AUTH_REQUIRED === 'true' ? '' : 'saas-demo'), name: 'Владелец SaaS', role: 'platform_owner', organizationId: null }
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
  owner: ['floor', 'orders', 'reservations', 'inventory', 'finance', 'staff', 'staff_manage', 'staff_sensitive', 'settings', 'integrations', 'delivery'],
  admin: ['floor', 'orders', 'reservations', 'inventory', 'finance', 'staff', 'staff_manage', 'staff_view', 'staff_sensitive', 'settings', 'integrations', 'delivery'],
  senior_bartender: ['floor', 'orders', 'bar_tasks'],
  senior_hookah_master: ['floor', 'orders', 'hookah_tasks'],
  bartender: ['floor', 'orders', 'bar_tasks'],
  hookah_master: ['floor', 'orders', 'hookah_tasks'],
  developer: ['floor', 'orders', 'reservations', 'inventory_read', 'finance_read', 'staff', 'staff_manage', 'staff_view', 'settings', 'diagnostics', 'integrations', 'delivery'],
  platform_owner: ['platform', 'diagnostics', 'settings']
};
const staffPinCipher = {
  encrypt(pin) { const wrapped = staffPassportCipher.encrypt({ pin: String(pin) }); return wrapped; },
  decrypt(row) { const wrapped = staffPassportCipher.decrypt({ passport_data_encrypted: row?.pin_data_encrypted, passport_data_iv: row?.pin_data_iv, passport_data_tag: row?.pin_data_tag }); return wrapped?.pin || null; }
};
const permissionScopes = ['orders', 'reservations', 'inventory', 'finance', 'staff', 'delivery', 'integrations', 'settings'];
const scopedPermissionMap = {
  orders: ['orders'],
  reservations: ['reservations'],
  inventory: ['inventory'],
  finance: ['finance'],
  staff: ['staff', 'staff_manage', 'staff_view', 'staff_sensitive'],
  delivery: ['delivery'],
  integrations: ['integrations'],
  settings: ['settings']
};
const normalizePermissionScopes = (value) => [...new Set((Array.isArray(value) ? value : []).map((scope) => String(scope || '').trim()).filter((scope) => permissionScopes.includes(scope)))];
const effectivePermissions = (user) => {
  const base = rolePermissions[user?.role] || [];
  const scopes = normalizePermissionScopes(user?.permissionScopes);
  if (user?.role !== 'admin' || !scopes.length) return base;
  const restricted = new Set(Object.values(scopedPermissionMap).flat());
  return [...new Set([...base.filter((permission) => !restricted.has(permission)), ...scopes.flatMap((scope) => scopedPermissionMap[scope] || [])])];
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
const normalizePhoneNumbers = (value) => { const seen = new Set(); const contacts = (Array.isArray(value) ? value : []).map((entry) => ({ label: String(entry?.label || 'Дополнительный').trim().slice(0, 32), number: String(entry?.number || '').trim(), primary: Boolean(entry?.primary) })).filter((entry) => { const key = entry.number.replace(/\D/g, ''); if (!key || seen.has(key)) return false; seen.add(key); return true; }); if (contacts.length) { const primaryIndex = contacts.findIndex((entry) => entry.primary); contacts.forEach((entry, index) => { entry.primary = primaryIndex < 0 ? index === 0 : index === primaryIndex; }); } return contacts; };
const validEmploymentDate = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const orderTotal = (order) => order.items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
const approvedDiscountTotal = (orderId, subtotal) => discountRequests.filter((request) => request.orderId === orderId && request.status === 'approved' && request.type === 'percent').reduce((sum, request) => sum + subtotal * Math.min(100, Math.max(0, Number(request.value || 0))) / 100, 0);
const orderNetTotal = (order) => Math.max(0, orderTotal(order) - approvedDiscountTotal(order.id, orderTotal(order)));
const orderStatusTransitions = { open: ['open', 'in_progress', 'cancelled'], in_progress: ['in_progress', 'ready', 'open', 'cancelled'], ready: ['ready', 'closed', 'in_progress', 'cancelled'], closed: ['closed'], cancelled: ['cancelled'] };
const validOrderTransition = (from, to) => Boolean(orderStatusTransitions[from]?.includes(to));
const vipSummary = (order) => {
  const minimum = Number(order.minimumOrderTotal || 0);
  const total = orderTotal(order);
  return { orderId: order.id, total, minimum, shortfall: Math.max(0, minimum - total), minimumApplied: minimum > 0 };
};
const businessTimezone = process.env.BUSINESS_TIMEZONE || 'Asia/Yekaterinburg';
const businessDateKey = (value) => { const raw = String(value || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const parsed = value instanceof Date ? value : new Date(value); if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10); return new Intl.DateTimeFormat('en-CA', { timeZone: businessTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed); };
const today = () => businessDateKey(new Date());
const recentBusinessDates = (count = 7) => { const current = new Date(`${today()}T00:00:00Z`); return Array.from({ length: count }, (_, index) => { const date = new Date(current); date.setUTCDate(current.getUTCDate() - (count - 1 - index)); return date.toISOString().slice(0, 10); }); };
const pendingPaymentSummary = (items = orders) => { const active = items.filter((order) => ['open', 'in_progress', 'ready'].includes(order.status)); const pendingRevenue = active.reduce((sum, order) => { const due = Math.max(Number(order.minimumOrderTotal || 0), orderNetTotal(order)); const paid = (order.payments || []).filter((payment) => ['paid', 'partially_paid'].includes(payment.status)).reduce((total, payment) => total + Number(payment.amount || 0), 0); return sum + Math.max(0, due - paid); }, 0); return { pendingOrders: active.length, pendingRevenue: Math.round(pendingRevenue * 100) / 100 }; };
const metrics = () => ({
  ...pendingPaymentSummary(),
  openOrders: orders.filter((order) => ['open', 'in_progress', 'ready'].includes(order.status)).length,
  closedOrders: orders.filter((order) => order.status === 'closed').length,
  discountRequests: discountRequests.filter((request) => request.status === 'requested').length,
  staffActive: staff.filter((person) => person.active).length,
  reservationsToday: reservations.filter((reservation) => reservation.date === today()).length,
  lowStock: inventory.filter((item) => item.onHand <= item.minLevel).length
});
const setMemoryTableStatus = (tableId, status) => { const table = floor.flatMap((zone) => zone.tables).find((entry) => entry.id === tableId); if (table && table.status !== 'blocked') table.status = status; };
const releaseMemoryTableIfIdle = (tableId) => { const hasActiveOrder = orders.some((order) => order.tableId === tableId && ['open', 'in_progress', 'ready'].includes(order.status)); const hasReservation = reservations.some((reservation) => reservation.tableId === tableId && reservation.status === 'confirmed' && reservation.date === today()); if (!hasActiveOrder) setMemoryTableStatus(tableId, hasReservation ? 'reserved' : 'free'); };

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const sessionFromRequest = async (req) => {
  const header = req.headers.authorization || '';
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2));
  const token = header.startsWith('Bearer ') ? header.slice(7) : (cookies.crm_session || '');
  if (!token) return null;
  const memorySession = sessions.get(token);
  if (memorySession) { if (Date.now() - memorySession.createdAt > 28_800_000) { sessions.delete(token); return null; } return memorySession; }
  if (sessionRepository) { try { const persisted = await sessionRepository.get(hashToken(token)); if (persisted) return { user: { id: persisted.userId, organizationId: persisted.organizationId || null, name: persisted.name, role: persisted.role, avatarUrl: persisted.avatarUrl || null, telegram: persisted.telegram || '', phoneNumbers: persisted.phoneNumbers || [], permissionScopes: normalizePermissionScopes(persisted.permissionScopes) } }; } catch (_) {} }
  return null;
};
const recordAudit = (req, action, entityType, entityId, beforeData, afterData) => {
  const event = { id: `audit-${Date.now()}-${auditEvents.length}`, action, entityType, entityId: entityId || null, actor: req.user?.name || 'demo', beforeData: beforeData || null, afterData: afterData || null, createdAt: new Date().toISOString() };
  auditEvents.push(event);
  if (repositories?.audit) repositories.audit.record({ venueId: venueDbId, actorId: /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : null, action, entityType, entityId: /^[0-9a-f-]{36}$/i.test(entityId || '') ? entityId : null, beforeData, afterData }).catch(() => {});
};
const validImageData = (value) => /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(value || '')) && String(value).length <= 2_000_000;
const hasPermission = (req, permission) => process.env.AUTH_REQUIRED !== 'true' || Boolean(req.user && effectivePermissions(req.user).includes(permission));
const canAssignStaffRole = (req, role) => process.env.AUTH_REQUIRED !== 'true' || req.user?.role === 'owner' || (['admin', 'developer'].includes(req.user?.role) && !['owner', 'admin', 'developer'].includes(role));
const canSeeSensitiveStaff = (req) => Boolean(req.user && effectivePermissions(req.user).includes('staff_sensitive'));
const denyUnless = (req, res, permission) => { if (hasPermission(req, permission)) return false; json(res, 403, { error: 'forbidden', permission }); return true; };
const denyUnlessAny = (req, res, permissions) => { if (permissions.some((permission) => hasPermission(req, permission))) return false; json(res, 403, { error: 'forbidden', permission: permissions.join(' or ') }); return true; };

async function api(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') { const headers = { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' }; if (process.env.CORS_ORIGIN) headers['Access-Control-Allow-Origin'] = process.env.CORS_ORIGIN; res.writeHead(204, headers); return res.end(); }
  if (pathname === '/api/login' && req.method === 'POST') {
    const input = await body(req);
    const loginKey = String(input.username || '').trim().toLowerCase() || 'anonymous';
    const requestedPin = String(input.pin || '').trim();
    if (requestedPin && !/^\d{4}$/.test(requestedPin)) return json(res, 400, { error: 'invalid_staff_pin_format' });
    const attempt = loginAttempts.get(loginKey);
    if (attempt && attempt.blockedUntil > Date.now()) return json(res, 429, { error: 'too_many_login_attempts', retryAfter: Math.ceil((attempt.blockedUntil - Date.now()) / 1000) });
    let account = [...demoAccounts, ...provisionedAccounts].find((entry) => entry.username === input.username && ((requestedPin && entry.pin === requestedPin) || (!requestedPin && entry.password === input.password)));
    if (!account) { const person = staff.find((entry) => entry.active && entry.login === input.username); const credential = requestedPin || input.password; if (person && credential && await verifyPassword(credential, person.passwordHash)) account = { username: person.login, id: person.id, organizationId: person.organizationId || saasAccount.id, name: person.name, role: person.role, avatarUrl: person.avatarUrl, telegram: person.telegram, phoneNumbers: person.phoneNumbers, permissionScopes: person.permissionScopes || [] }; }
    if (!account && repositories?.pool) {
      try {
        let rows;
        try {
          ({ rows } = await repositories.pool.query('SELECT id,login,organization_id AS "organizationId",venue_id AS "venueId",full_name AS name,role,pin_hash,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",permission_scopes AS "permissionScopes" FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username]));
        } catch (_) {
          try { ({ rows } = await repositories.pool.query('SELECT id,login,full_name AS name,role,pin_hash,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers" FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username])); }
          catch (_) { ({ rows } = await repositories.pool.query('SELECT id,login,full_name AS name,role,pin_hash,avatar_url AS "avatarUrl" FROM users WHERE login=$1 AND is_active=true LIMIT 1', [input.username])); }
        }
        const row = rows[0]; const credential = requestedPin || input.password; if (row && credential && await verifyPassword(credential, row.pin_hash)) account = { username: row.login, id: row.id, organizationId: row.organizationId || null, name: row.name, role: row.role, avatarUrl: row.avatarUrl, telegram: row.telegram || null, phoneNumbers: row.phoneNumbers || [], permissionScopes: row.permissionScopes || [] };
      } catch (_) {}
    }
    if (!account) { const current = loginAttempts.get(loginKey) || { count: 0, firstAt: Date.now() }; const withinWindow = Date.now() - current.firstAt < 60_000; const next = withinWindow ? { count: current.count + 1, firstAt: current.firstAt } : { count: 1, firstAt: Date.now() }; if (next.count >= 5) next.blockedUntil = Date.now() + 60_000; loginAttempts.set(loginKey, next); return json(res, next.blockedUntil ? 429 : 401, { error: next.blockedUntil ? 'too_many_login_attempts' : 'invalid_credentials', ...(next.blockedUntil ? { retryAfter: 60 } : {}) }); }
    loginAttempts.delete(loginKey);
    const token = crypto.randomBytes(32).toString('hex');
    const userId = account.id || (account.username === 'owner' ? '20000000-0000-0000-0000-000000000001' : '20000000-0000-0000-0000-000000000002');
    const organizationId = account.organizationId === undefined ? '00000000-0000-0000-0000-000000000010' : account.organizationId;
    const userVenueId = account.venueId || null;
    sessions.set(token, { user: { id: userId, organizationId, venueId: userVenueId, name: account.name, role: account.role, avatarUrl: account.avatarUrl || null, telegram: account.telegram || '', phoneNumbers: account.phoneNumbers || [], permissionScopes: normalizePermissionScopes(account.permissionScopes) }, createdAt: Date.now() });
    if (sessionRepository) { try { await sessionRepository.create({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 28_800_000).toISOString() }); } catch (_) {} }
    res.setHeader('Set-Cookie', `crm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
    return json(res, 200, { token, user: { id: userId, organizationId, venueId: userVenueId, name: account.name, role: account.role, avatarUrl: account.avatarUrl || null, telegram: account.telegram || '', phoneNumbers: account.phoneNumbers || [], permissionScopes: normalizePermissionScopes(account.permissionScopes) }, permissions: effectivePermissions({ role: account.role, permissionScopes: account.permissionScopes }), expiresIn: 28800 });
  }
  if (pathname === '/api/logout' && req.method === 'POST') { const header = req.headers.authorization || ''; const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2)); const token = header.startsWith('Bearer ') ? header.slice(7) : (cookies.crm_session || ''); if (token && sessionRepository) sessionRepository.remove(hashToken(token)).catch(() => {}); sessions.delete(token); res.setHeader('Set-Cookie', 'crm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  const hasRequestCredential = Boolean((req.headers.authorization || '').startsWith('Bearer ') || String(req.headers.cookie || '').includes('crm_session='));
  if ((process.env.AUTH_REQUIRED === 'true' || hasRequestCredential) && pathname !== '/api/health' && pathname !== '/api/login' && pathname !== '/api/public/venue-brand') {
    const session = await sessionFromRequest(req);
    if (!session) { if (process.env.AUTH_REQUIRED === 'true') return json(res, 401, { error: 'authentication_required' }); }
    else { req.user = session.user; if (req.user?.venueId && /^[0-9a-f-]{36}$/i.test(req.user.venueId)) venueDbId = req.user.venueId; }
  }
  if (pathname === '/api/health') return json(res, 200, { status: 'ok', service: 'hookah-crm' });
  if (pathname === '/api/public/venue-brand' && req.method === 'GET') {
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT name,logo_url AS "logoUrl" FROM venues WHERE id=$1', [venueDbId]); if (rows[0]) return json(res, 200, rows[0]); } catch (_) {} }
    return json(res, 200, { name: venue.name, logoUrl: venue.logoUrl || null });
  }
  if (pathname === '/api/notifications' && req.method === 'GET') {
    if (denyUnlessAny(req, res, ['staff_view', 'settings'])) return;
    const items = staffNotifications.filter((item) => !item.notificationRecipients?.length || process.env.AUTH_REQUIRED !== 'true' || item.notificationRecipients.includes(req.user?.role));
    return json(res, 200, { items });
  }
  if (pathname === '/api/saas/account' && req.method === 'GET') {
    if (denyUnlessAny(req, res, ['settings', 'diagnostics'])) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(venueDbId)) {
      try {
        const { rows } = await repositories.pool.query(`SELECT o.id,o.name,o.slug,o.plan,o.timezone,
          COALESCE(s.status,'trialing') AS "subscriptionStatus",COALESCE(s.plan,o.plan) AS "subscriptionPlan",
          COALESCE(s.seats_limit,5) AS "seatsLimit",COALESCE(s.venues_limit,1) AS "venuesLimit",
          (SELECT COUNT(*)::int FROM users u WHERE u.organization_id=o.id AND u.is_active=true) AS "activeSeats",
          (SELECT COUNT(*)::int FROM venues v2 WHERE v2.organization_id=o.id AND v2.is_active=true) AS "activeVenues"
          FROM organizations o
          LEFT JOIN organization_subscriptions s ON s.organization_id=o.id WHERE o.id=$1 LIMIT 1`, [req.user?.organizationId || saasAccount.id]);
        if (rows[0]) return json(res, 200, { ...rows[0], seatsLimit: Number(rows[0].seatsLimit), venuesLimit: Number(rows[0].venuesLimit), activeSeats: Number(rows[0].activeSeats), activeVenues: Number(rows[0].activeVenues) });
      } catch (_) {}
    }
    const account = saasOrganizations.find((item) => item.id === req.user?.organizationId) || saasAccount;
    return json(res, 200, { ...account, subscriptionStatus: account.status || account.subscriptionStatus || 'trialing', subscriptionPlan: account.plan, activeSeats: Number(account.seats ?? staff.filter((person) => person.active).length), activeVenues: Number(account.venues ?? networkVenues.filter((item) => item.status !== 'archived').length) });
  }
  if (pathname === '/api/platform/plans' && req.method === 'GET') {
    if (denyUnless(req, res, 'platform')) return;
    return json(res, 200, { billingMode: 'test_free', currency: 'RUB', plans: saasPlans });
  }
  if (pathname === '/api/platform/overview' && req.method === 'GET') {
    if (denyUnless(req, res, 'platform')) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT COUNT(*)::int AS companies, COUNT(*) FILTER (WHERE is_active=true)::int AS active_companies FROM organizations`); const subs = await repositories.pool.query(`SELECT COUNT(*)::int AS trials FROM organization_subscriptions WHERE status='trialing'`); return json(res, 200, { companies: Number(rows[0]?.companies || 0), activeCompanies: Number(rows[0]?.active_companies || 0), trials: Number(subs.rows[0]?.trials || 0) }); } catch (_) {} }
    return json(res, 200, { companies: saasOrganizations.length, activeCompanies: saasOrganizations.filter((item) => item.isActive).length, trials: saasOrganizations.filter((item) => item.status === 'trialing').length });
  }
  if (pathname === '/api/platform/organizations' && req.method === 'GET') {
    if (denyUnless(req, res, 'platform')) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT o.id,o.name,o.slug,o.plan,o.is_active AS "isActive",o.created_at AS "createdAt",o.timezone,COALESCE(s.status,'trialing') AS status,(SELECT COUNT(*)::int FROM venues v WHERE v.organization_id=o.id AND v.is_active=true) AS venues,(SELECT COUNT(*)::int FROM users u WHERE u.organization_id=o.id AND u.is_active=true) AS seats,(SELECT city FROM venues v2 WHERE v2.organization_id=o.id ORDER BY v2.created_at LIMIT 1) AS city FROM organizations o LEFT JOIN organization_subscriptions s ON s.organization_id=o.id ORDER BY o.created_at DESC`); return json(res, 200, { items: rows }); } catch (_) {} }
    return json(res, 200, { items: saasOrganizations.slice().reverse().map((item) => ({ ...item, ...(saasPlans[item.plan] || saasPlans.starter), monthlyPrice: 0 })) });
  }
  if (pathname === '/api/platform/organizations' && req.method === 'POST') {
    if (denyUnless(req, res, 'platform')) return;
    const input = await body(req);
    const name = String(input.name || '').trim();
    const transliteration = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sh', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
    const generatedSlug = name.toLowerCase().replace(/[а-яё]/g, (letter) => transliteration[letter] || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = String(input.slug || generatedSlug || `company-${Date.now()}`).trim().toLowerCase();
    const ownerName = String(input.ownerName || '').trim();
    const ownerLogin = String(input.ownerLogin || '').trim().toLowerCase();
    const ownerPassword = String(input.ownerPassword || '');
    const plan = ['starter', 'growth', 'network', 'enterprise'].includes(input.plan) ? input.plan : 'starter';
    if (!name || name.length > 120 || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) return json(res, 400, { error: 'valid_name_and_slug_required' });
    if (!ownerName || ownerName.length > 120 || !/^[^\s@]+@[^\s@]+$/.test(ownerLogin) || ownerPassword.length < 8) return json(res, 400, { error: 'valid_owner_credentials_required' });
    if (repositories?.pool) {
      const client = await repositories.pool.connect();
      try {
        await client.query('BEGIN');
        const org = await client.query(`INSERT INTO organizations (name,slug,plan,timezone) VALUES ($1,$2,$3,$4) RETURNING id,name,slug,plan,is_active AS "isActive",created_at AS "createdAt"`, [name, slug, plan, input.timezone || 'Europe/Moscow']);
        const organization = org.rows[0];
        await client.query(`INSERT INTO organization_subscriptions (organization_id,plan,status,seats_limit,venues_limit) VALUES ($1,$2,'trialing',$3,$4)`, [organization.id, plan, saasPlans[plan].seatsLimit, saasPlans[plan].venuesLimit]);
        const venueRow = await client.query(`INSERT INTO venues (organization_id,name,city,address,format,timezone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [organization.id, name, String(input.city || '').trim(), String(input.address || '').trim(), 'кальян-бар', input.timezone || 'Europe/Moscow']);
        const passwordHash = await hashPassword(ownerPassword);
        const owner = await client.query(`INSERT INTO users (venue_id,organization_id,full_name,login,pin_hash,role) VALUES ($1,$2,$3,$4,$5,'owner') RETURNING id,full_name AS name,login,role`, [venueRow.rows[0].id, organization.id, ownerName, ownerLogin, passwordHash]);
        await client.query(`INSERT INTO organization_memberships (organization_id,user_id,membership_role,status) VALUES ($1,$2,'owner','active')`, [organization.id, owner.rows[0].id]);
        await client.query('COMMIT');
        recordAudit(req, 'platform.organization_created', 'organization', organization.id, null, { ...organization, ownerLogin });
        return json(res, 201, { ...organization, status: 'trialing', venues: 1, seats: 1, city: input.city || '', owner: owner.rows[0] });
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); return json(res, 409, { error: 'organization_create_failed', detail: error.code === '23505' ? 'slug_or_owner_login_already_exists' : error.message }); }
      finally { client.release(); }
    }
    if (saasOrganizations.some((item) => item.slug === slug) || provisionedAccounts.some((item) => item.username === ownerLogin)) return json(res, 409, { error: 'slug_or_owner_login_already_exists' });
    const organizationId = `org-${Date.now()}`;
    const item = { id: organizationId, name, slug, plan, status: 'trialing', city: String(input.city || '').trim(), venues: 1, seats: 1, createdAt: new Date().toISOString(), isActive: true, seatsLimit: saasPlans[plan].seatsLimit, venuesLimit: saasPlans[plan].venuesLimit };
    saasOrganizations.push(item);
    provisionedAccounts.push({ username: ownerLogin, password: ownerPassword, name: ownerName, role: 'owner', organizationId, venueId: `venue-${Date.now()}` });
    recordAudit(req, 'platform.organization_created', 'organization', item.id, null, { ...item, ownerLogin });
    return json(res, 201, { ...item, owner: { name: ownerName, login: ownerLogin, role: 'owner' } });
  }
  const platformOrgSubscription = pathname.match(/^\/api\/platform\/organizations\/([^/]+)\/subscription$/);
  if (platformOrgSubscription && req.method === 'GET') {
    if (denyUnless(req, res, 'platform')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(platformOrgSubscription[1])) { try { const { rows } = await repositories.pool.query(`SELECT organization_id AS "organizationId",plan,status,billing_mode AS "billingMode",monthly_price_cents AS "monthlyPriceCents",seats_limit AS "seatsLimit",venues_limit AS "venuesLimit",trial_ends_at AS "trialEndsAt" FROM organization_subscriptions WHERE organization_id=$1`, [platformOrgSubscription[1]]); if (rows[0]) return json(res, 200, { ...rows[0], monthlyPrice: Number(rows[0].monthlyPriceCents || 0) / 100 }); } catch (_) {} }
    const item = saasOrganizations.find((entry) => entry.id === platformOrgSubscription[1]); if (!item) return json(res, 404, { error: 'organization_not_found' }); const plan = saasPlans[item.plan] || saasPlans.starter; return json(res, 200, { organizationId: item.id, plan: item.plan, status: item.status, billingMode: 'test_free', monthlyPrice: 0, seatsLimit: plan.seatsLimit, venuesLimit: plan.venuesLimit, trialEndsAt: item.trialEndsAt || null });
  }
  if (platformOrgSubscription && req.method === 'PATCH') {
    if (denyUnless(req, res, 'platform')) return;
    const input = await body(req); const item = saasOrganizations.find((entry) => entry.id === platformOrgSubscription[1]); const planKey = String(input.plan || ''); if (!item) return json(res, 404, { error: 'organization_not_found' }); if (!saasPlans[planKey]) return json(res, 400, { error: 'invalid_plan' }); const before = { ...item }; item.plan = planKey; item.status = ['active','trialing','past_due','cancelled'].includes(input.status) ? input.status : item.status; Object.assign(item, { seatsLimit: saasPlans[planKey].seatsLimit, venuesLimit: saasPlans[planKey].venuesLimit, monthlyPrice: 0 }); if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(item.id)) { try { await repositories.pool.query(`UPDATE organization_subscriptions SET plan=$1,status=$2,billing_mode='test_free',monthly_price_cents=0,seats_limit=$3,venues_limit=$4,updated_at=now() WHERE organization_id=$5`, [planKey, item.status, saasPlans[planKey].seatsLimit, saasPlans[planKey].venuesLimit, item.id]); await repositories.pool.query('UPDATE organizations SET plan=$1 WHERE id=$2', [planKey, item.id]); } catch (_) {} } recordAudit(req, 'platform.subscription_updated', 'organization_subscription', item.id, before, item); return json(res, 200, { organizationId: item.id, plan: item.plan, status: item.status, billingMode: 'test_free', monthlyPrice: 0, seatsLimit: item.seatsLimit, venuesLimit: item.venuesLimit });
  }  const platformOrgPath = pathname.match(/^\/api\/platform\/organizations\/([^/]+)$/);
  if (platformOrgPath && req.method === 'PATCH') {
    if (denyUnless(req, res, 'platform')) return;
    const input = await body(req); const item = saasOrganizations.find((entry) => entry.id === platformOrgPath[1]); if (!item) return json(res, 404, { error: 'organization_not_found' }); const before = { ...item }; if (input.name !== undefined) item.name = String(input.name).trim().slice(0, 120); if (input.plan !== undefined && ['starter','growth','network','enterprise'].includes(input.plan)) item.plan = input.plan; if (input.isActive !== undefined) item.isActive = Boolean(input.isActive); recordAudit(req, 'platform.organization_updated', 'organization', item.id, before, item); return json(res, 200, item);
  }
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
      const { rows } = await repositories.pool.query('SELECT id,name,city,format,phone,address,logo_url AS "logoUrl",timezone FROM venues WHERE id=$1', [venueDbId]);
      if (rows[0]) { const { rows: vipRows } = await repositories.pool.query('SELECT name,min_order_total FROM tables WHERE venue_id=$1 AND name IN ($2,$3)', [venueDbId, 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 1', 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 2']); const vipRoomMinimums = { ...venue.vipRoomMinimums }; vipRows.forEach((row) => { if (row.name.endsWith('1')) vipRoomMinimums.vip_room_1 = Number(row.min_order_total); if (row.name.endsWith('2')) vipRoomMinimums.vip_room_2 = Number(row.min_order_total); }); venue.vipRoomMinimums = vipRoomMinimums; return json(res, 200, { ...venue, ...rows[0], vipRoomMinimums }); }
    } catch (_) {} }
    return json(res, 200, venue);
  }
  if (pathname === '/api/venue' && (req.method === 'PATCH' || req.method === 'PUT')) {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const before = { ...venue };
    if (input.name !== undefined && (!String(input.name).trim() || String(input.name).length > 120)) return json(res, 400, { error: 'venue_name_required' });
    if (input.city !== undefined && (!String(input.city).trim() || String(input.city).length > 80)) return json(res, 400, { error: 'venue_city_required' });
    if (input.address !== undefined && (!String(input.address).trim() || String(input.address).length > 240)) return json(res, 400, { error: 'venue_address_required' });
    if (input.format !== undefined && String(input.format).length > 80) return json(res, 400, { error: 'venue_format_too_long' });
    if (input.timezone !== undefined && String(input.timezone).length > 64) return json(res, 400, { error: 'venue_timezone_too_long' });
    if (input.phone !== undefined && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone))) return json(res, 400, { error: 'invalid_phone' });
    if (input.logoUrl !== undefined && input.logoUrl !== null && !validImageData(input.logoUrl)) return json(res, 400, { error: 'invalid_logo' });
    if (input.vipRoomMinimums !== undefined) {
      const values = input.vipRoomMinimums || {};
      for (const key of ['vip_room_1', 'vip_room_2']) if (values[key] !== undefined && (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0)) return json(res, 400, { error: 'invalid_vip_minimum' });
      venue.vipRoomMinimums = { ...venue.vipRoomMinimums, ...Object.fromEntries(['vip_room_1', 'vip_room_2'].filter((key) => values[key] !== undefined).map((key) => [key, Math.round(Number(values[key]))])) };
      floor.flatMap((zone) => zone.tables).forEach((table) => { if (table.id === 'vip-room-1') table.minimumOrderTotal = venue.vipRoomMinimums.vip_room_1; if (table.id === 'vip-room-2') table.minimumOrderTotal = venue.vipRoomMinimums.vip_room_2; });
      if (repositories?.pool) { try { await repositories.pool.query('UPDATE tables SET min_deposit=$1,min_order_total=$1 WHERE venue_id=$2 AND name=$3', [venue.vipRoomMinimums.vip_room_1, venueDbId, 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 1']); await repositories.pool.query('UPDATE tables SET min_deposit=$1,min_order_total=$1 WHERE venue_id=$2 AND name=$3', [venue.vipRoomMinimums.vip_room_2, venueDbId, 'VIP-\u043a\u043e\u043c\u043d\u0430\u0442\u0430 2']); } catch (_) {} }
    }
    Object.assign(venue, Object.fromEntries(['name', 'city', 'format', 'phone', 'address', 'timezone', 'logoUrl'].filter((key) => input[key] !== undefined).map((key) => [key, key === 'logoUrl' ? input[key] : String(input[key]).trim()])));
    if (repositories?.pool) { try { await repositories.pool.query('UPDATE venues SET name=$1,city=$2,format=$3,phone=$4,address=$5,timezone=$6,logo_url=$7 WHERE id=$8', [venue.name, venue.city, venue.format, venue.phone, venue.address, venue.timezone, venue.logoUrl, venueDbId]); } catch (_) {} }
    recordAudit(req, 'venue.updated', 'venue', venue.id, before, venue); return json(res, 200, venue);
  }
  if (pathname === '/api/integrations') { if (denyUnlessAny(req, res, ['diagnostics', 'settings', 'integrations'])) return; return json(res, 200, integrations); }
  if (pathname === '/api/network/venues' && req.method === 'GET') {
    if (denyUnlessAny(req, res, ['settings', 'diagnostics'])) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT id,name,format,city,address,phone,timezone,is_current AS "isCurrent" FROM venues WHERE is_active=true ORDER BY name'); const hasMarkedCurrent = rows.some((row) => Boolean(row.isCurrent)); return json(res, 200, { items: rows.map((row) => ({ ...row, status: 'active', isCurrent: hasMarkedCurrent ? Boolean(row.isCurrent) : row.id === venueDbId })) }); } catch (_) {} }
    return json(res, 200, { items: networkVenues.filter((item) => item.status !== 'archived').map((item) => ({ ...item, isCurrent: item.id === currentVenueId })) });
  }
  if (pathname === '/api/network/venues' && req.method === 'POST') {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const name = String(input.name || '').trim(); const city = String(input.city || '').trim(); const address = String(input.address || '').trim();
    if (!name || name.length > 120 || !city || city.length > 80 || !address || address.length > 240) return json(res, 400, { error: 'venue_name_city_address_required' });
    const item = { id: `venue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, format: String(input.format || 'кальян-бар').trim().slice(0, 80), city, address, phone: String(input.phone || '').trim().slice(0, 32), timezone: String(input.timezone || venue.timezone).trim().slice(0, 64), status: 'active', isCurrent: false };
    if (repositories?.pool) {
      try {
        const { rows } = await repositories.pool.query('INSERT INTO venues (name,format,city,address,phone,timezone,is_current) VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id,name,format,city,address,phone,timezone,is_current AS "isCurrent"', [name, item.format, city, address, item.phone || null, item.timezone]);
        const created = { ...rows[0], status: 'active', isCurrent: false }; recordAudit(req, 'venue.created', 'venue', created.id, null, created); return json(res, 201, created);
      } catch (error) { return json(res, 409, { error: 'venue_create_failed', detail: error.message }); }
    }
    networkVenues.push(item); recordAudit(req, 'venue.created', 'venue', item.id, null, item); return json(res, 201, item);
  }
  const networkVenuePath = pathname.match(/^\/api\/network\/venues\/([^/]+)$/);
  if (networkVenuePath && req.method === 'PATCH') {
    if (denyUnless(req, res, 'settings')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(networkVenuePath[1])) {
      const input = await body(req);
      const fields = []; const values = [networkVenuePath[1]];
      for (const [column, key, max] of [['name', 'name', 120], ['format', 'format', 80], ['city', 'city', 80], ['address', 'address', 240], ['phone', 'phone', 32], ['timezone', 'timezone', 64]]) if (input[key] !== undefined) { fields.push(`${column}=$${values.length + 1}`); values.push(String(input[key] || '').trim().slice(0, max)); }
      if (!fields.length) return json(res, 400, { error: 'venue_name_city_address_required' });
      try { const { rows } = await repositories.pool.query(`UPDATE venues SET ${fields.join(',')} WHERE id=$1 AND is_active=true RETURNING id,name,format,city,address,phone,timezone`, values); if (!rows[0]) return json(res, 404, { error: 'venue_not_found' }); const updated = { ...rows[0], status: 'active', isCurrent: rows[0].id === venueDbId }; recordAudit(req, 'venue.updated', 'venue', updated.id, null, updated); return json(res, 200, updated); } catch (error) { return json(res, 409, { error: 'venue_update_failed', detail: error.message }); }
    }
    const item = networkVenues.find((entry) => entry.id === networkVenuePath[1]); if (!item || item.status === 'archived') return json(res, 404, { error: 'venue_not_found' });
    const input = await body(req); const before = { ...item };
    for (const [key, max] of [['name', 120], ['city', 80], ['address', 240], ['format', 80], ['phone', 32], ['timezone', 64]]) if (input[key] !== undefined) item[key] = String(input[key] || '').trim().slice(0, max);
    if (!item.name || !item.city || !item.address) return json(res, 400, { error: 'venue_name_city_address_required' });
    if (item.id === currentVenueId) Object.assign(venue, { name: item.name, city: item.city, address: item.address, phone: item.phone, timezone: item.timezone, format: item.format });
    recordAudit(req, 'venue.updated', 'venue', item.id, before, item); return json(res, 200, { ...item, isCurrent: item.id === currentVenueId });
  }
  if (networkVenuePath && req.method === 'DELETE') {
    if (denyUnless(req, res, 'settings')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(networkVenuePath[1])) {
      if (networkVenuePath[1] === venueDbId) return json(res, 409, { error: 'current_venue_cannot_be_archived' });
      try { const { rows } = await repositories.pool.query('UPDATE venues SET is_active=false WHERE id=$1 AND is_active=true RETURNING id,name,format,city,address,phone,timezone', [networkVenuePath[1]]); if (!rows[0]) return json(res, 404, { error: 'venue_not_found' }); const archived = { ...rows[0], status: 'archived', isCurrent: false }; recordAudit(req, 'venue.archived', 'venue', archived.id, { status: 'active' }, archived); return json(res, 200, archived); } catch (error) { return json(res, 409, { error: 'venue_archive_failed', detail: error.message }); }
    }
    const item = networkVenues.find((entry) => entry.id === networkVenuePath[1]); if (!item || item.status === 'archived') return json(res, 404, { error: 'venue_not_found' });
    if (item.id === currentVenueId) return json(res, 409, { error: 'current_venue_cannot_be_archived' });
    item.status = 'archived'; recordAudit(req, 'venue.archived', 'venue', item.id, { status: 'active' }, { status: 'archived' }); return json(res, 200, item);
  }
  const networkVenueSelect = pathname.match(/^\/api\/network\/venues\/([^/]+)\/select$/);
  if (networkVenueSelect && req.method === 'POST') {
    if (denyUnless(req, res, 'settings')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(networkVenueSelect[1])) {
      try { const client = await repositories.pool.connect(); try { await client.query('BEGIN'); const { rows } = await client.query('SELECT id,name,format,city,address,phone,timezone FROM venues WHERE id=$1 AND is_active=true FOR UPDATE', [networkVenueSelect[1]]); if (!rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { error: 'venue_not_found' }); } await client.query('UPDATE venues SET is_current=false WHERE is_active=true'); await client.query('UPDATE venues SET is_current=true WHERE id=$1', [networkVenueSelect[1]]); await client.query('COMMIT'); const previousVenueId = venueDbId; const selected = { ...rows[0], status: 'active', isCurrent: true }; venueDbId = selected.id; recordAudit(req, 'venue.selected', 'venue', selected.id, { currentVenueId: previousVenueId }, { currentVenueId: selected.id }); return json(res, 200, selected); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } } catch (error) { return json(res, 409, { error: 'venue_select_failed', detail: error.message }); }
    }
    const item = networkVenues.find((entry) => entry.id === networkVenueSelect[1]); if (!item || item.status === 'archived') return json(res, 404, { error: 'venue_not_found' });
    const before = networkVenues.find((entry) => entry.id === currentVenueId); currentVenueId = item.id; Object.assign(venue, { name: item.name, city: item.city, address: item.address, phone: item.phone, timezone: item.timezone, format: item.format });
    recordAudit(req, 'venue.selected', 'venue', item.id, { currentVenueId: before?.id || null }, { currentVenueId: item.id }); return json(res, 200, { ...item, isCurrent: true });
  }
  if (pathname === '/api/finance/categories' && req.method === 'GET') {
    if (denyUnlessAny(req, res, ['finance', 'finance_read'])) return;
    const query = String(url.searchParams.get('q') || '').trim().toLocaleLowerCase('ru-RU');
    return json(res, 200, { items: financeCategories.filter((item) => item.active !== false && (!query || item.name.toLocaleLowerCase('ru-RU').includes(query))) });
  }
  if (pathname === '/api/finance/categories' && req.method === 'POST') {
    if (denyUnless(req, res, 'finance')) return;
    const input = await body(req); const name = String(input.name || '').trim(); const kind = String(input.kind || 'income');
    if (!name || name.length > 80 || !['income', 'expense'].includes(kind)) return json(res, 400, { error: 'invalid_finance_category' });
    if (financeCategories.some((item) => item.active && item.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return json(res, 409, { error: 'finance_category_exists' });
    const category = { id: `finance-category-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, kind, active: true };
    financeCategories.push(category); recordAudit(req, 'finance_category.created', 'finance_category', category.id, null, category); return json(res, 201, category);
  }
  const financeCategoryPath = pathname.match(/^\/api\/finance\/categories\/([^/]+)$/);
  if (financeCategoryPath && req.method === 'PATCH') {
    if (denyUnless(req, res, 'finance')) return;
    const category = financeCategories.find((item) => item.id === financeCategoryPath[1]); if (!category) return json(res, 404, { error: 'finance_category_not_found' });
    const input = await body(req); const name = input.name === undefined ? category.name : String(input.name || '').trim(); const kind = input.kind === undefined ? category.kind : String(input.kind);
    if (!name || name.length > 80 || !['income', 'expense'].includes(kind)) return json(res, 400, { error: 'invalid_finance_category' });
    const before = { ...category }; category.name = name; category.kind = kind; recordAudit(req, 'finance_category.updated', 'finance_category', category.id, before, category); return json(res, 200, category);
  }
  if (financeCategoryPath && req.method === 'DELETE') {
    if (denyUnless(req, res, 'finance')) return;
    const category = financeCategories.find((item) => item.id === financeCategoryPath[1]); if (!category) return json(res, 404, { error: 'finance_category_not_found' });
    category.active = false; recordAudit(req, 'finance_category.deactivated', 'finance_category', category.id, { active: true }, { active: false }); return json(res, 200, category);
  }
  if (pathname === '/api/metrics') {
    if (repositories?.pool) {
      try {
        const [ordersMetric, discountsMetric, staffMetric, reservationsMetric, stockMetric] = await Promise.all([
          repositories.pool.query(`WITH item_totals AS (SELECT order_id, COALESCE(SUM(quantity * unit_price),0) AS subtotal FROM order_items GROUP BY order_id), discount_totals AS (SELECT order_id, COALESCE(SUM(CASE WHEN type='percent' THEN (SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0) FROM order_items oi WHERE oi.order_id=d.order_id) * LEAST(100,GREATEST(0,value))/100 ELSE GREATEST(0,value) END),0) AS discount FROM discounts d WHERE status='approved' GROUP BY order_id), paid_totals AS (SELECT order_id, COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','partially_paid')),0) AS paid FROM payments GROUP BY order_id) SELECT COUNT(*) FILTER (WHERE o.status IN ('open','in_progress','ready'))::int AS open_orders, COUNT(*) FILTER (WHERE o.status='closed')::int AS closed_orders, COALESCE(SUM(CASE WHEN o.status IN ('open','in_progress','ready') THEN GREATEST(COALESCE(o.vip_minimum,0),COALESCE(i.subtotal,0)-COALESCE(d.discount,0)) - COALESCE(p.paid,0) ELSE 0 END),0) AS pending_revenue FROM orders o LEFT JOIN item_totals i ON i.order_id=o.id LEFT JOIN discount_totals d ON d.order_id=o.id LEFT JOIN paid_totals p ON p.order_id=o.id WHERE o.venue_id=$1`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM discounts d JOIN orders o ON o.id=d.order_id WHERE o.venue_id=$1 AND d.status='requested'`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE venue_id=$1 AND is_active=true`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM reservations WHERE venue_id=$1 AND starts_at::date=CURRENT_DATE AND status='confirmed'`, [venueDbId]),
          repositories.pool.query(`SELECT COUNT(*)::int AS count FROM ingredients WHERE venue_id=$1 AND on_hand <= min_level`, [venueDbId])
        ]);
        const orderRow = ordersMetric.rows[0] || {};
        return json(res, 200, { openOrders: Number(orderRow.open_orders || 0), pendingOrders: Number(orderRow.open_orders || 0), pendingRevenue: Number(orderRow.pending_revenue || 0), closedOrders: Number(orderRow.closed_orders || 0), discountRequests: Number(discountsMetric.rows[0]?.count || 0), staffActive: Number(staffMetric.rows[0]?.count || 0), reservationsToday: Number(reservationsMetric.rows[0]?.count || 0), lowStock: Number(stockMetric.rows[0]?.count || 0) });
      } catch (error) {
        return json(res, 503, { error: 'database_unavailable', detail: error.message });
      }
    }
    return json(res, 200, metrics());
  }
  if (pathname === '/api/analytics' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'finance_read') && !hasPermission(req, 'finance')) return json(res, 403, { error: 'forbidden', permission: 'analytics' });
    const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 6); const startDate = start.toISOString().slice(0, 10); const endDate = end.toISOString().slice(0, 10);
    if (repositories?.pool) {
      try {
        const [daily, products, hall] = await Promise.all([
          repositories.pool.query(`SELECT d::date AS date, COALESCE(SUM(p.amount),0) AS revenue, COUNT(DISTINCT o.id)::int AS orders FROM generate_series($2::date,$3::date,'1 day') d LEFT JOIN orders o ON o.venue_id=$1 AND o.status='closed' AND o.closed_at::date=d::date LEFT JOIN payments p ON p.order_id=o.id AND p.status IN ('paid','partially_paid') GROUP BY d::date ORDER BY d::date`, [venueDbId, startDate, endDate]),
          repositories.pool.query(`SELECT COALESCE(p.name,'Позиция') AS name, SUM(oi.quantity)::numeric AS quantity FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.venue_id=$1 AND o.status='closed' AND o.closed_at >= $2::date AND o.closed_at < ($3::date + INTERVAL '1 day') GROUP BY p.name ORDER BY quantity DESC LIMIT 5`, [venueDbId, startDate, endDate]),
          repositories.pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('occupied','reserved'))::int AS busy FROM tables WHERE venue_id=$1`, [venueDbId])
        ]);
        const days = daily.rows.map((row) => ({ date: String(row.date).slice(0, 10), revenue: Number(row.revenue || 0), orders: Number(row.orders || 0) })); const totalRevenue = days.reduce((sum, row) => sum + row.revenue, 0); const totalOrders = days.reduce((sum, row) => sum + row.orders, 0); const hallRow = hall.rows[0] || {};
        return json(res, 200, { days, averageCheck: totalOrders ? totalRevenue / totalOrders : 0, topProducts: products.rows.map((row) => ({ name: row.name, quantity: Number(row.quantity || 0) })), hallLoad: { busy: Number(hallRow.busy || 0), total: Number(hallRow.total || 0) } });
      } catch (error) { return json(res, 503, { error: 'analytics_unavailable', detail: error.message }); }
    }
    const dayKey = (value) => businessDateKey(value); const dayDates = recentBusinessDates(7); const days = dayDates.map((date) => { const closed = orders.filter((order) => order.status === 'closed' && dayKey(order.closedAt || order.createdAt) === date); return { date, revenue: closed.reduce((sum, order) => sum + Number(order.finalTotal || orderTotal(order) || 0), 0), orders: closed.length }; }); const counts = new Map(); orders.filter((order) => order.status === 'closed' && dayDates.includes(dayKey(order.closedAt || order.createdAt))).flatMap((order) => order.items || []).forEach((item) => { const name = item.name || item.productName || item.productId || 'Позиция'; counts.set(name, (counts.get(name) || 0) + Number(item.quantity || 0)); }); const totalRevenue = days.reduce((sum, row) => sum + row.revenue, 0); const totalOrders = days.reduce((sum, row) => sum + row.orders, 0); const tables = floor.flatMap((zone) => zone.tables || []); return json(res, 200, { days, averageCheck: totalOrders ? totalRevenue / totalOrders : 0, topProducts: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, quantity]) => ({ name, quantity })), hallLoad: { busy: tables.filter((table) => ['occupied', 'reserved'].includes(table.status)).length, total: tables.length } });
  }
  if (pathname === '/api/audit' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'diagnostics') && !hasPermission(req, 'settings')) return json(res, 403, { error: 'forbidden', permission: 'diagnostics' });
    const filters = { action: String(url.searchParams.get('action') || '').trim().slice(0, 120), entityType: String(url.searchParams.get('entityType') || '').trim().slice(0, 80), from: String(url.searchParams.get('from') || '').trim(), to: String(url.searchParams.get('to') || '').trim(), limit: url.searchParams.get('limit') };
    if (filters.from && !/^\d{4}-\d{2}-\d{2}$/.test(filters.from)) filters.from = '';
    if (filters.to && !/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) filters.to = '';
    if (repositories?.audit) { try { return json(res, 200, { items: await repositories.audit.list(venueDbId, filters), filters }); } catch (_) {} }
    let items = auditEvents.slice().reverse();
    if (filters.action) items = items.filter((item) => item.action === filters.action);
    if (filters.entityType) items = items.filter((item) => item.entityType === filters.entityType);
    if (filters.from) items = items.filter((item) => String(item.createdAt).slice(0, 10) >= filters.from);
    if (filters.to) items = items.filter((item) => String(item.createdAt).slice(0, 10) <= filters.to);
    items = items.slice(0, Math.min(Math.max(Number(filters.limit) || 100, 1), 300));
    return json(res, 200, { items, total: items.length, filters });
  }
  const floorTablePath = pathname.match(/^\/api\/floor\/tables\/([^/]+)$/);
  if (pathname === '/api/floor/zones' && req.method === 'POST') {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const name = String(input.name || '').trim();
    if (!name || name.length > 80) return json(res, 400, { error: 'invalid_zone_name' });
    const sortOrder = Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : floor.length;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('INSERT INTO zones (venue_id,name,sort_order) VALUES ($1,$2,$3) RETURNING id,name,sort_order', [venueDbId, name, sortOrder]); recordAudit(req, 'floor_zone.created', 'zone', rows[0].id, null, rows[0]); return json(res, 201, { ...rows[0], tables: [] }); } catch (error) { return json(res, 409, { error: 'zone_create_failed', detail: error.message }); } }
    const zone = { id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, sortOrder, tables: [] }; floor.push(zone); recordAudit(req, 'floor_zone.created', 'zone', zone.id, null, zone); return json(res, 201, zone);
  }
  const floorZonePath = pathname.match(/^\/api\/floor\/zones\/([^/]+)$/);
  if (floorZonePath && ['PATCH', 'DELETE'].includes(req.method)) {
    if (denyUnless(req, res, 'settings')) return;
    const zoneId = decodeURIComponent(floorZonePath[1]);
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(zoneId)) {
      if (req.method === 'PATCH') { const input = await body(req); const name = String(input.name || '').trim(); if (!name || name.length > 80) return json(res, 400, { error: 'invalid_zone_name' }); try { const { rows } = await repositories.pool.query('UPDATE zones SET name=$1,sort_order=COALESCE($2,sort_order) WHERE id=$3 AND venue_id=$4 RETURNING id,name,sort_order', [name, input.sortOrder === undefined ? null : Number(input.sortOrder), zoneId, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'zone_not_found' }); recordAudit(req, 'floor_zone.updated', 'zone', zoneId, null, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'zone_update_failed', detail: error.message }); } }
      try { const { rows: countRows } = await repositories.pool.query('SELECT COUNT(*)::int AS count FROM tables WHERE zone_id=$1', [zoneId]); if (Number(countRows[0]?.count || 0)) return json(res, 409, { error: 'zone_not_empty' }); const { rows } = await repositories.pool.query('DELETE FROM zones WHERE id=$1 AND venue_id=$2 RETURNING id,name,sort_order', [zoneId, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'zone_not_found' }); recordAudit(req, 'floor_zone.deleted', 'zone', zoneId, rows[0], null); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'zone_delete_failed', detail: error.message }); }
    }
    const zone = floor.find((entry) => entry.id === zoneId); if (!zone) return json(res, 404, { error: 'zone_not_found' });
    if (req.method === 'PATCH') { const input = await body(req); const name = String(input.name || '').trim(); if (!name || name.length > 80) return json(res, 400, { error: 'invalid_zone_name' }); const before = { ...zone }; zone.name = name; if (input.sortOrder !== undefined && Number.isInteger(Number(input.sortOrder))) zone.sortOrder = Number(input.sortOrder); recordAudit(req, 'floor_zone.updated', 'zone', zone.id, before, zone); return json(res, 200, zone); }
    if (zone.tables.length) return json(res, 409, { error: 'zone_not_empty' }); const before = { ...zone }; floor.splice(floor.indexOf(zone), 1); recordAudit(req, 'floor_zone.deleted', 'zone', zone.id, before, null); return json(res, 200, zone);
  }
  if (pathname === '/api/floor/tables' && req.method === 'POST') {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const zoneId = String(input.zoneId || '').trim(); const name = String(input.name || '').trim(); const capacity = Number(input.capacity || 2); const minimumOrderTotal = Number(input.minimumOrderTotal || 0);
    if (!zoneId || !name || name.length > 80) return json(res, 400, { error: 'invalid_table_name' });
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return json(res, 400, { error: 'invalid_table_capacity' });
    if (!Number.isFinite(minimumOrderTotal) || minimumOrderTotal < 0) return json(res, 400, { error: 'invalid_vip_minimum' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(zoneId)) { try { const { rows } = await repositories.pool.query('INSERT INTO tables (zone_id,name,capacity,min_deposit,min_order_total) SELECT id,$2,$3,$4,$4 FROM zones WHERE id=$1 AND venue_id=$5 RETURNING id,name,status,capacity,min_order_total,layout', [zoneId, name, capacity, minimumOrderTotal, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'zone_not_found' }); const table = { ...rows[0], minimumOrderTotal: Number(rows[0].min_order_total), layout: rows[0].layout || {} }; recordAudit(req, 'floor_table.created', 'table', table.id, null, table); return json(res, 201, table); } catch (error) { return json(res, 409, { error: 'table_create_failed', detail: error.message }); } }
    const zone = floor.find((entry) => entry.id === zoneId); if (!zone) return json(res, 404, { error: 'zone_not_found' }); const table = { id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, status: 'free', capacity, minimumOrderTotal, layout: {} }; zone.tables.push(table); recordAudit(req, 'floor_table.created', 'table', table.id, null, table); return json(res, 201, table);
  }
  if (floorTablePath && req.method === 'PATCH') {
    if (denyUnless(req, res, 'settings')) return;
    const input = await body(req); const tableId = decodeURIComponent(floorTablePath[1]);
    const allowedShapes = new Set(['rectangle', 'square', 'circle', 'oval', 'freeform']);
    const layout = input.layout && typeof input.layout === 'object' ? input.layout : {};
    const numeric = ['x', 'y', 'width', 'height', 'rotation'];
    for (const key of numeric) if (layout[key] !== undefined && (!Number.isFinite(Number(layout[key])) || Number(layout[key]) < 0 || Number(layout[key]) > 5000)) return json(res, 400, { error: 'invalid_table_layout' });
    if (layout.shape !== undefined && !allowedShapes.has(String(layout.shape))) return json(res, 400, { error: 'invalid_table_shape' });
    if (layout.width !== undefined && Number(layout.width) < 40 || layout.height !== undefined && Number(layout.height) < 40) return json(res, 400, { error: 'table_layout_too_small' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(tableId)) {
      try { const fields = []; const values = []; if (input.name !== undefined) { const name = String(input.name).trim(); if (!name || name.length > 80) return json(res, 400, { error: 'invalid_table_name' }); fields.push(`name=$${values.length + 1}`); values.push(name); } if (input.capacity !== undefined) { const capacity = Number(input.capacity); if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return json(res, 400, { error: 'invalid_table_capacity' }); fields.push(`capacity=$${values.length + 1}`); values.push(capacity); } if (input.minimumOrderTotal !== undefined) { const minimum = Number(input.minimumOrderTotal); if (!Number.isFinite(minimum) || minimum < 0) return json(res, 400, { error: 'invalid_vip_minimum' }); fields.push(`min_deposit=$${values.length + 1}`, `min_order_total=$${values.length + 1}`); values.push(minimum); } if (input.status !== undefined) { if (!['free', 'blocked'].includes(String(input.status))) return json(res, 400, { error: 'invalid_table_status' }); fields.push(`status=$${values.length + 1}`); values.push(String(input.status)); } if (Object.keys(layout).length) { fields.push(`layout=$${values.length + 1}::jsonb`); values.push(JSON.stringify(layout)); } if (!fields.length) return json(res, 400, { error: 'table_changes_required' }); values.push(tableId, venueDbId); const { rows } = await repositories.pool.query(`UPDATE tables SET ${fields.join(',')} WHERE id=$${values.length - 1} AND venue_id=$${values.length} RETURNING id,name,status,capacity,min_order_total,layout`, values); if (!rows[0]) return json(res, 404, { error: 'table_not_found' }); recordAudit(req, 'floor_table.updated', 'table', tableId, null, rows[0]); return json(res, 200, { ...rows[0], minimumOrderTotal: Number(rows[0].min_order_total), layout: rows[0].layout || {} }); } catch (error) { return json(res, 409, { error: 'table_update_failed', detail: error.message }); }
    }
    const table = floor.flatMap((zone) => zone.tables).find((entry) => entry.id === tableId); if (!table) return json(res, 404, { error: 'table_not_found' });
    const before = { ...table, layout: { ...(table.layout || {}) } }; if (input.name !== undefined) { const name = String(input.name).trim(); if (!name || name.length > 80) return json(res, 400, { error: 'invalid_table_name' }); table.name = name; } if (input.capacity !== undefined) { const capacity = Number(input.capacity); if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return json(res, 400, { error: 'invalid_table_capacity' }); table.capacity = capacity; } if (input.minimumOrderTotal !== undefined) { const minimum = Number(input.minimumOrderTotal); if (!Number.isFinite(minimum) || minimum < 0) return json(res, 400, { error: 'invalid_vip_minimum' }); table.minimumOrderTotal = minimum; } if (input.status !== undefined) { if (!['free', 'blocked'].includes(String(input.status))) return json(res, 400, { error: 'invalid_table_status' }); table.status = String(input.status); } table.layout = { ...(table.layout || {}), ...layout }; recordAudit(req, 'floor_table.updated', 'table', tableId, before, table); return json(res, 200, table);
  }
  if (floorTablePath && req.method === 'DELETE') {
    if (denyUnless(req, res, 'settings')) return;
    const tableId = decodeURIComponent(floorTablePath[1]);
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(tableId)) { try { const { rows: active } = await repositories.pool.query("SELECT 1 FROM orders WHERE table_id=$1 AND venue_id=$2 AND status IN ('open','in_progress','ready') LIMIT 1", [tableId, venueDbId]); if (active[0]) return json(res, 409, { error: 'table_in_use' }); const { rows } = await repositories.pool.query('DELETE FROM tables WHERE id=$1 AND zone_id IN (SELECT id FROM zones WHERE venue_id=$2) RETURNING id,name', [tableId, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'table_not_found' }); recordAudit(req, 'floor_table.deleted', 'table', tableId, rows[0], null); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'table_delete_failed', detail: error.message }); } }
    const zone = floor.find((entry) => entry.tables.some((entry) => entry.id === tableId)); const table = zone?.tables.find((entry) => entry.id === tableId); if (!table) return json(res, 404, { error: 'table_not_found' }); if (orders.some((order) => order.tableId === tableId && ['open', 'in_progress', 'ready'].includes(order.status))) return json(res, 409, { error: 'table_in_use' }); zone.tables.splice(zone.tables.indexOf(table), 1); recordAudit(req, 'floor_table.deleted', 'table', tableId, table, null); return json(res, 200, table);
  }
  if (pathname === '/api/floor') {
    if (denyUnless(req, res, 'floor')) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT z.id AS zone_id,z.name AS zone_name,z.sort_order,t.id,t.name,CASE WHEN t.status='blocked' THEN 'blocked' WHEN EXISTS (SELECT 1 FROM orders o WHERE o.table_id=t.id AND o.venue_id=$1 AND o.status IN ('open','in_progress','ready')) THEN 'occupied' ELSE t.status END AS status,t.capacity,t.min_order_total,t.layout FROM zones z JOIN tables t ON t.zone_id=z.id WHERE z.venue_id=$1 ORDER BY z.sort_order,t.name`, [venueDbId]); const zones = []; for (const row of rows) { let zone = zones.find((entry) => entry.id === row.zone_id); if (!zone) { zone = { id: row.zone_id, name: row.zone_name, tables: [] }; zones.push(zone); } zone.tables.push({ id: row.id, name: row.name, status: row.status, capacity: row.capacity, minimumOrderTotal: Number(row.min_order_total), layout: row.layout || {} }); } return json(res, 200, { zones }); } catch (_) {} }
    const derivedFloor = floor.map((zone) => ({ ...zone, tables: zone.tables.map((table) => ({ ...table, status: table.status === 'blocked' ? 'blocked' : (orders.some((order) => order.tableId === table.id && ['open', 'in_progress', 'ready'].includes(order.status)) ? 'occupied' : table.status) })) }));
    return json(res, 200, { zones: derivedFloor });
  }
  if (pathname === '/api/product-categories' && req.method === 'GET') {
    if (denyUnless(req, res, 'inventory_read')) return;
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('SELECT id,name,is_active AS active FROM product_categories WHERE venue_id=$1 AND is_active=true ORDER BY name', [venueDbId]); return json(res, 200, { items: rows }); } catch (_) {} }
    return json(res, 200, { items: productCategories.filter((item) => item.active) });
  }
  if (pathname === '/api/product-categories' && req.method === 'POST') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req); const name = String(input.name || '').trim();
    if (!name || name.length > 80) return json(res, 400, { error: 'invalid_product_category' });
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query('INSERT INTO product_categories (venue_id,name) VALUES ($1,$2) RETURNING id,name,is_active AS active', [venueDbId, name]); const category = rows[0]; recordAudit(req, 'product_category.created', 'product_category', category.id, null, category); return json(res, 201, category); } catch (error) { return json(res, error.code === '23505' ? 409 : 409, { error: error.code === '23505' ? 'product_category_exists' : 'product_category_create_failed', detail: error.message }); } }
    if (productCategories.some((item) => item.active && item.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return json(res, 409, { error: 'product_category_exists' });
    const category = { id: `product-category-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, active: true };
    productCategories.push(category); recordAudit(req, 'product_category.created', 'product_category', category.id, null, category); return json(res, 201, category);
  }
  const productCategoryPath = pathname.match(/^\/api\/product-categories\/([^/]+)$/);
  if (productCategoryPath && req.method === 'PATCH') {
    if (denyUnless(req, res, 'inventory')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(productCategoryPath[1])) { const input = await body(req); const name = String(input.name || '').trim(); if (!name || name.length > 80) return json(res, 400, { error: 'invalid_product_category' }); try { const { rows } = await repositories.pool.query('UPDATE product_categories SET name=$1 WHERE id=$2 AND venue_id=$3 AND is_active=true RETURNING id,name,is_active AS active', [name, productCategoryPath[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'product_category_not_found' }); recordAudit(req, 'product_category.updated', 'product_category', rows[0].id, null, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: error.code === '23505' ? 'product_category_exists' : 'product_category_update_failed', detail: error.message }); } }
    const category = productCategories.find((item) => item.id === productCategoryPath[1]); if (!category) return json(res, 404, { error: 'product_category_not_found' });
    const input = await body(req); const name = String(input.name || '').trim();
    if (!name || name.length > 80) return json(res, 400, { error: 'invalid_product_category' });
    if (productCategories.some((item) => item.active && item.id !== category.id && item.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return json(res, 409, { error: 'product_category_exists' });
    const before = { ...category }; category.name = name; recordAudit(req, 'product_category.updated', 'product_category', category.id, before, category); return json(res, 200, category);
  }
  if (productCategoryPath && req.method === 'DELETE') {
    if (denyUnless(req, res, 'inventory')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(productCategoryPath[1])) { try { const { rows } = await repositories.pool.query('UPDATE product_categories SET is_active=false WHERE id=$1 AND venue_id=$2 AND is_active=true RETURNING id,name,is_active AS active', [productCategoryPath[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'product_category_not_found' }); recordAudit(req, 'product_category.deactivated', 'product_category', rows[0].id, { active: true }, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'product_category_delete_failed', detail: error.message }); } }
    const category = productCategories.find((item) => item.id === productCategoryPath[1]); if (!category) return json(res, 404, { error: 'product_category_not_found' });
    const before = { ...category }; category.active = false; recordAudit(req, 'product_category.deactivated', 'product_category', category.id, before, category); return json(res, 200, category);
  }
  if (pathname === '/api/products' && req.method === 'GET') {
    if (denyUnless(req, res, 'floor')) return;
    if (repositories?.products) { try { return json(res, 200, { items: await repositories.products.list(venueDbId) }); } catch (_) {} }
    return json(res, 200, { items: products });
  }
  if (pathname === '/api/recipes' && req.method === 'GET') {
    if (denyUnless(req, res, 'inventory_read')) return;
    return json(res, 200, { items: catalogSeed.recipes || [] });
  }
  if (pathname === '/api/products' && req.method === 'POST') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req); const name = String(input.name || '').trim(); const category = String(input.category || input.station || '').trim(); const price = Number(input.price);
    const aliases = Array.isArray(input.aliases) ? input.aliases.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : [];
    if (!name || name.length > 120 || !category || category.length > 80 || !Number.isFinite(price) || price < 0 || price > 10000000) return json(res, 400, { error: 'invalid_product' });
    if (input.imageUrl && (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(input.imageUrl)) || String(input.imageUrl).length > 1500000)) return json(res, 400, { error: 'invalid_image' });
    if (repositories?.products) { try { const product = await repositories.products.create({ venueId: venueDbId, name, category, price, aliases, imageUrl: input.imageUrl }); recordAudit(req, 'product.created', 'product', product.id, null, product); return json(res, 201, product); } catch (error) { return json(res, 409, { error: 'product_create_failed', detail: error.message }); } }
    const product = { id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, category, station: category, price, aliases, imageUrl: input.imageUrl || null };
    products.push(product); recordAudit(req, 'product.created', 'product', product.id, null, product); return json(res, 201, product);
  }
  const productProfile = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productProfile && req.method === 'PATCH') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req); const name = input.name === undefined ? undefined : String(input.name || '').trim(); const category = input.category === undefined && input.station === undefined ? undefined : String(input.category ?? input.station ?? '').trim(); const price = input.price === undefined ? undefined : Number(input.price);
    const aliases = input.aliases === undefined ? undefined : (Array.isArray(input.aliases) ? input.aliases.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : null);
    if (name !== undefined && (!name || name.length > 120) || category !== undefined && (!category || category.length > 80) || price !== undefined && (!Number.isFinite(price) || price < 0 || price > 10000000) || aliases === null) return json(res, 400, { error: 'invalid_product' });
    if (input.imageUrl !== undefined && input.imageUrl && (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(input.imageUrl)) || String(input.imageUrl).length > 1500000)) return json(res, 400, { error: 'invalid_image' });
    if (repositories?.products) { try { const before = (await repositories.products.list(venueDbId)).find((entry) => entry.id === productProfile[1]); if (!before) return json(res, 404, { error: 'product_not_found' }); const product = await repositories.products.update(venueDbId, productProfile[1], { name, category, price, aliases, imageUrl: input.imageUrl }); recordAudit(req, 'product.updated', 'product', product.id, before, product); return json(res, 200, product); } catch (error) { return json(res, 409, { error: 'product_update_failed', detail: error.message }); } }
    const product = products.find((entry) => entry.id === productProfile[1]); if (!product) return json(res, 404, { error: 'product_not_found' }); const before = { ...product }; if (name !== undefined) product.name = name; if (category !== undefined) { product.category = category; product.station = category; } if (price !== undefined) product.price = price; if (aliases !== undefined) product.aliases = aliases; if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl || null; recordAudit(req, 'product.updated', 'product', product.id, before, product); return json(res, 200, product);
  }
  if (productProfile && req.method === 'DELETE') {
    if (denyUnless(req, res, 'inventory')) return;
    if (repositories?.products) { try { const product = await repositories.products.deactivate(venueDbId, productProfile[1]); if (!product) return json(res, 404, { error: 'product_not_found' }); recordAudit(req, 'product.deactivated', 'product', product.id, { active: true }, { active: false }); return json(res, 200, { ...product, active: false }); } catch (error) { return json(res, 409, { error: 'product_delete_failed', detail: error.message }); } }
    const index = products.findIndex((entry) => entry.id === productProfile[1]); if (index < 0) return json(res, 404, { error: 'product_not_found' }); const [product] = products.splice(index, 1); recordAudit(req, 'product.deactivated', 'product', product.id, { active: true }, { active: false }); return json(res, 200, { ...product, active: false });
  }
  if (pathname === '/api/clients' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'staff') && !hasPermission(req, 'staff_view') && !hasPermission(req, 'orders')) return json(res, 403, { error: 'forbidden', permission: 'clients' });
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT g.id,g.full_name AS name,g.phone,g.email,g.avatar_url AS "avatarUrl",g.guest_status AS "guestStatus",g.archived_at AS "archivedAt",g.phone_numbers AS "phoneNumbers",g.telegram,g.tobacco_preferences AS "tobaccoPreferences",g.bowl_preferences AS "bowlPreferences",g.bar_preferences AS "barPreferences",g.allergies,g.loyalty_points AS "loyaltyPoints",g.notes,COUNT(DISTINCT o.id)::int AS visits,COALESCE(SUM(p.amount),0)::numeric AS "totalSpent",MAX(o.closed_at) AS "lastVisitAt" FROM guests g LEFT JOIN orders o ON o.guest_id=g.id AND o.status='closed' LEFT JOIN payments p ON p.order_id=o.id AND p.status IN ('paid','partially_paid') WHERE g.venue_id=$1 AND g.archived_at IS NULL AND ($2='' OR LOWER(CONCAT_WS(' ',g.full_name,g.phone,g.telegram,g.phone_numbers::text,ARRAY_TO_STRING(COALESCE(g.tobacco_preferences,'{}'),' '),ARRAY_TO_STRING(COALESCE(g.bowl_preferences,'{}'),' '),ARRAY_TO_STRING(COALESCE(g.bar_preferences,'{}'),' '),g.allergies,g.notes)) LIKE '%'||LOWER($2)||'%') GROUP BY g.id ORDER BY COALESCE(MAX(o.closed_at),g.created_at) DESC`, [venueDbId, query]); return json(res, 200, { items: rows.map((row) => ({ ...row, phoneNumbers: row.phoneNumbers || (row.phone ? [{ label: 'Основной', number: row.phone, primary: true }] : []), tobaccoPreferences: row.tobaccoPreferences || [], bowlPreferences: row.bowlPreferences || [], barPreferences: row.barPreferences || [], loyaltyPoints: Number(row.loyaltyPoints || 0), visits: Number(row.visits || 0), totalSpent: Number(row.totalSpent || 0) })) }); } catch (_) {} }
    const items = clients.filter((client) => !query || `${client.name} ${client.telegram} ${(client.phoneNumbers || []).map((phone) => phone.number).join(' ')} ${client.tobaccoPreferences.join(' ')} ${client.barPreferences.join(' ')}`.toLowerCase().includes(query));
    return json(res, 200, { items });
  }
  const clientArchive = pathname.match(/^\/api\/clients\/([^/]+)\/archive$/);
  if (clientArchive && req.method === 'POST') { if (denyUnlessAny(req, res, ['staff_manage', 'orders'])) return; const id = clientArchive[1]; const memory = clients.find((entry) => entry.id === id); if (memory) { memory.archivedAt = new Date().toISOString(); recordAudit(req, 'client.archived', 'client', id, { archivedAt: null }, { archivedAt: memory.archivedAt }); return json(res, 200, memory); } if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(id)) { try { const { rows } = await repositories.pool.query('UPDATE guests SET archived_at=now() WHERE id=$1 AND venue_id=$2 AND archived_at IS NULL RETURNING id,full_name AS name,archived_at AS "archivedAt"', [id, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'client_not_found' }); recordAudit(req, 'client.archived', 'client', id, { archivedAt: null }, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'client_archive_failed', detail: error.message }); } } return json(res, 404, { error: 'client_not_found' }); }
  const clientDelete = pathname.match(/^\/api\/clients\/([^/]+)$/);
  if (clientDelete && req.method === 'DELETE') { if (denyUnless(req, res, 'staff_manage')) return; if (req.user?.role !== 'owner') return json(res, 403, { error: 'client_delete_owner_required' }); const id = clientDelete[1]; const index = clients.findIndex((entry) => entry.id === id); if (index >= 0) { const [removed] = clients.splice(index, 1); recordAudit(req, 'client.deleted', 'client', id, removed, null); return json(res, 200, { id, deleted: true }); } if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(id)) { try { const { rows } = await repositories.pool.query('DELETE FROM guests WHERE id=$1 AND venue_id=$2 RETURNING id', [id, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'client_not_found' }); recordAudit(req, 'client.deleted', 'client', id, { id }, null); return json(res, 200, { id, deleted: true }); } catch (error) { return json(res, 409, { error: 'client_delete_failed', detail: error.message }); } } return json(res, 404, { error: 'client_not_found' }); }
  if (pathname === '/api/clients' && req.method === 'POST') {
    if (denyUnlessAny(req, res, ['staff_manage', 'orders'])) return;
    const input = await body(req); const name = String(input.name || '').trim();
    if (!name || name.length > 120) return json(res, 400, { error: 'client_name_required' });
    if (input.phoneNumbers !== undefined && (!Array.isArray(input.phoneNumbers) || input.phoneNumbers.length > 5 || input.phoneNumbers.some((entry) => !entry || !/^\+?[0-9 ()-]{7,24}$/.test(String(entry.number || '').trim())))) return json(res, 400, { error: 'invalid_phone_numbers' });
    const phoneNumbers = normalizePhoneNumbers(input.phoneNumbers);
    if (phoneNumbers.length && phoneNumbers.filter((phone) => phone.primary).length !== 1) return json(res, 400, { error: 'one_primary_phone_required' });
    if (input.telegram && !/^(@[A-Za-z0-9_]{5,32}|https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$)/.test(String(input.telegram).trim())) return json(res, 400, { error: 'invalid_telegram' });
    const avatarUrl = input.avatarUrl === undefined ? null : String(input.avatarUrl || '');
    const guestStatus = String(input.guestStatus || 'new');
    if (!['new', 'regular', 'vip', 'blocked'].includes(guestStatus)) return json(res, 400, { error: 'invalid_guest_status' });
    if (avatarUrl && (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarUrl) || avatarUrl.length > 2000000)) return json(res, 400, { error: 'invalid_avatar' });
    const client = { id: `client-${Date.now()}`, name, avatarUrl, guestStatus, phoneNumbers, telegram: String(input.telegram || '').trim(), tobaccoPreferences: Array.isArray(input.tobaccoPreferences) ? input.tobaccoPreferences.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : [], bowlPreferences: Array.isArray(input.bowlPreferences) ? input.bowlPreferences.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20) : [], barPreferences: Array.isArray(input.barPreferences) ? input.barPreferences.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : [], allergies: String(input.allergies || '').trim().slice(0, 500), notes: String(input.notes || '').trim().slice(0, 2000), loyaltyPoints: 0, visits: 0, totalSpent: 0, lastVisitAt: null };
    if (repositories?.pool) { try { const primary = phoneNumbers.find((phone) => phone.primary)?.number || null; const { rows } = await repositories.pool.query(`INSERT INTO guests (venue_id,phone,full_name,avatar_url,guest_status,phone_numbers,telegram,tobacco_preferences,bowl_preferences,bar_preferences,allergies,notes) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12) RETURNING id,full_name AS name,phone,avatar_url AS "avatarUrl",guest_status AS "guestStatus",phone_numbers AS "phoneNumbers",telegram,tobacco_preferences AS "tobaccoPreferences",bowl_preferences AS "bowlPreferences",bar_preferences AS "barPreferences",allergies,notes,loyalty_points AS "loyaltyPoints"`, [venueDbId, primary, name, client.avatarUrl || null, client.guestStatus, JSON.stringify(phoneNumbers), client.telegram || null, client.tobaccoPreferences, client.bowlPreferences, client.barPreferences, client.allergies || null, client.notes || null]); if (rows[0]) return json(res, 201, { ...client, ...rows[0] }); } catch (_) {} }
    clients.push(client); recordAudit(req, 'client.created', 'client', client.id, null, client); return json(res, 201, client);
  }
  const clientProfile = pathname.match(/^\/api\/clients\/([^/]+)$/);
  if (clientProfile && req.method === 'PATCH') {
    if (denyUnlessAny(req, res, ['staff_manage', 'orders'])) return;
    let client = clients.find((entry) => entry.id === clientProfile[1]);
    if (!client && repositories?.pool && /^[0-9a-f-]{36}$/i.test(clientProfile[1])) {
      try {
        const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,phone,avatar_url AS "avatarUrl",guest_status AS "guestStatus",phone_numbers AS "phoneNumbers",telegram,tobacco_preferences AS "tobaccoPreferences",bowl_preferences AS "bowlPreferences",bar_preferences AS "barPreferences",allergies,notes,loyalty_points AS "loyaltyPoints" FROM guests WHERE id=$1 AND venue_id=$2`, [clientProfile[1], venueDbId]);
        if (rows[0]) client = { ...rows[0], phoneNumbers: rows[0].phoneNumbers || (rows[0].phone ? [{ label: 'Основной', number: rows[0].phone, primary: true }] : []), tobaccoPreferences: rows[0].tobaccoPreferences || [], bowlPreferences: rows[0].bowlPreferences || [], barPreferences: rows[0].barPreferences || [], loyaltyPoints: Number(rows[0].loyaltyPoints || 0) };
      } catch (_) {}
    }
    if (!client) return json(res, 404, { error: 'client_not_found' });
    const input = await body(req); const before = JSON.parse(JSON.stringify(client));
    if (input.name !== undefined) { const name = String(input.name || '').trim(); if (!name || name.length > 120) return json(res, 400, { error: 'client_name_required' }); client.name = name; }
    if (input.phoneNumbers !== undefined) { if (!Array.isArray(input.phoneNumbers) || input.phoneNumbers.length > 5 || input.phoneNumbers.some((entry) => !entry || !/^\+?[0-9 ()-]{7,24}$/.test(String(entry.number || '').trim()))) return json(res, 400, { error: 'invalid_phone_numbers' }); const phoneNumbers = normalizePhoneNumbers(input.phoneNumbers); if (phoneNumbers.length && phoneNumbers.filter((phone) => phone.primary).length !== 1) return json(res, 400, { error: 'one_primary_phone_required' }); client.phoneNumbers = phoneNumbers; }
    if (input.avatarUrl !== undefined) { const avatarUrl = String(input.avatarUrl || ''); if (avatarUrl && (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarUrl) || avatarUrl.length > 2000000)) return json(res, 400, { error: 'invalid_avatar' }); client.avatarUrl = avatarUrl || null; }
    if (input.guestStatus !== undefined) { const guestStatus = String(input.guestStatus || 'new'); if (!['new', 'regular', 'vip', 'blocked'].includes(guestStatus)) return json(res, 400, { error: 'invalid_guest_status' }); client.guestStatus = guestStatus; }
    if (input.telegram !== undefined) { const telegram = String(input.telegram || '').trim(); if (telegram && !/^(@[A-Za-z0-9_]{5,32}|https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$)/.test(telegram)) return json(res, 400, { error: 'invalid_telegram' }); client.telegram = telegram; }
    for (const key of ['tobaccoPreferences', 'bowlPreferences', 'barPreferences']) if (input[key] !== undefined) client[key] = Array.isArray(input[key]) ? input[key].map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : [];
    if (input.allergies !== undefined) client.allergies = String(input.allergies || '').trim().slice(0, 500);
    if (input.notes !== undefined) client.notes = String(input.notes || '').trim().slice(0, 2000);
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(client.id)) { try { const primary = client.phoneNumbers.find((phone) => phone.primary)?.number || null; const { rows } = await repositories.pool.query(`UPDATE guests SET phone=$1,full_name=$2,avatar_url=$3,guest_status=$4,phone_numbers=$5::jsonb,telegram=$6,tobacco_preferences=$7,bowl_preferences=$8,bar_preferences=$9,allergies=$10,notes=$11 WHERE id=$12 AND venue_id=$13 RETURNING id,full_name AS name,phone,avatar_url AS "avatarUrl",guest_status AS "guestStatus",phone_numbers AS "phoneNumbers",telegram,tobacco_preferences AS "tobaccoPreferences",bowl_preferences AS "bowlPreferences",bar_preferences AS "barPreferences",allergies,notes,loyalty_points AS "loyaltyPoints"`, [primary, client.name, client.avatarUrl || null, client.guestStatus, JSON.stringify(client.phoneNumbers), client.telegram || null, client.tobaccoPreferences, client.bowlPreferences, client.barPreferences, client.allergies || null, client.notes || null, client.id, venueDbId]); if (rows[0]) return json(res, 200, { ...client, ...rows[0] }); } catch (_) {} }
    recordAudit(req, 'client.updated', 'client', client.id, before, client); return json(res, 200, client);
  }
  const clientHistory = pathname.match(/^\/api\/clients\/([^/]+)\/history$/);
  if (clientHistory && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'staff') && !hasPermission(req, 'staff_view') && !hasPermission(req, 'orders')) return json(res, 403, { error: 'forbidden', permission: 'clients' });
    const clientId = clientHistory[1];
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(clientId)) {
      try {
        const [orderRows, reservationRows] = await Promise.all([
          repositories.pool.query(`SELECT o.id,o.table_id AS "tableId",o.status,o.created_at AS "createdAt",o.closed_at AS "closedAt",o.vip_minimum AS "minimumOrderTotal",COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('paid','partially_paid')),0)::numeric AS total FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.venue_id=$1 AND o.guest_id=$2 GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50`, [venueDbId, clientId]),
          repositories.pool.query(`SELECT r.id,r.table_id AS "tableId",r.starts_at AS "startsAt",r.status,r.deposit,r.guests,r.notes FROM reservations r WHERE r.venue_id=$1 AND r.guest_id=$2 ORDER BY r.starts_at DESC LIMIT 50`, [venueDbId, clientId])
        ]);
        return json(res, 200, { orders: orderRows.rows.map((row) => ({ ...row, total: Number(row.total || 0), minimumOrderTotal: Number(row.minimumOrderTotal || 0) })), reservations: reservationRows.rows.map((row) => ({ ...row, deposit: Number(row.deposit || 0) })) });
      } catch (_) {}
    }
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) return json(res, 404, { error: 'client_not_found' });
    const phones = new Set((client.phoneNumbers || []).map((phone) => phone.number));
    const historyOrders = orders.filter((order) => order.clientId === clientId || order.guestName === client.name || phones.has(order.guestPhone)).map((order) => ({ id: order.id, tableId: order.tableId, status: order.status, createdAt: order.createdAt, closedAt: order.closedAt || null, total: order.finalTotal ?? (order.items || []).reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0), minimumOrderTotal: Number(order.minimumOrderTotal || 0) }));
    const historyReservations = reservations.filter((reservation) => reservation.clientId === clientId || reservation.guestName === client.name || phones.has(reservation.phone)).map((reservation) => ({ id: reservation.id, tableId: reservation.tableId, date: reservation.date, time: reservation.time, status: reservation.status, guests: reservation.guests, deposit: Number(reservation.deposit || 0), notes: reservation.notes || '' }));
    return json(res, 200, { orders: historyOrders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 50), reservations: historyReservations.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 50) });
  }
  const clientLoyalty = pathname.match(/^\/api\/clients\/([^/]+)\/loyalty$/);
  if (clientLoyalty && req.method === 'POST') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'finance') && !hasPermission(req, 'staff_manage')) return json(res, 403, { error: 'forbidden', permission: 'loyalty' });
    const input = await body(req); const delta = Number(input.delta); const reason = String(input.reason || '').trim();
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000 || !reason || reason.length > 500) return json(res, 400, { error: 'invalid_loyalty_adjustment' });
    let client = clients.find((entry) => entry.id === clientLoyalty[1]);
    if (!client && repositories?.pool && /^[0-9a-f-]{36}$/i.test(clientLoyalty[1])) {
      try { const { rows } = await repositories.pool.query('SELECT id,loyalty_points AS "loyaltyPoints" FROM guests WHERE id=$1 AND venue_id=$2', [clientLoyalty[1], venueDbId]); if (rows[0]) client = { ...rows[0], loyaltyPoints: Number(rows[0].loyaltyPoints || 0) }; } catch (_) {}
    }
    if (!client) return json(res, 404, { error: 'client_not_found' });
    const before = Number(client.loyaltyPoints || 0); client.loyaltyPoints = Math.max(0, before + delta);
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(client.id)) { try { await repositories.pool.query('UPDATE guests SET loyalty_points=$1 WHERE id=$2 AND venue_id=$3', [client.loyaltyPoints, client.id, venueDbId]); } catch (_) {} }
    recordAudit(req, 'client.loyalty_adjusted', 'client', client.id, { loyaltyPoints: before }, { loyaltyPoints: client.loyaltyPoints, delta, reason }); return json(res, 200, { id: client.id, loyaltyPoints: client.loyaltyPoints, delta, reason });
  }
  const productImage = pathname.match(/^\/api\/products\/([^/]+)\/image$/);
  if (productImage && req.method === 'POST') {
    if (denyUnless(req, res, 'inventory')) return;
    const input = await body(req); const imageData = String(input.imageData || '');
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData) || imageData.length > 1_500_000) return json(res, 400, { error: 'invalid_image', message: 'Поддерживаются PNG, JPG и WebP до 1.5 МБ' });
    if (repositories?.inventory) { const product = await repositories.inventory.setProductImage(venueDbId, productImage[1], imageData); if (!product) return json(res, 404, { error: 'product_not_found' }); recordAudit(req, 'product.image_updated', 'product', product.id, null, { id: product.id, name: product.name, imageUrl: '[image]' }); return json(res, 200, product); }
    const product = products.find((entry) => entry.id === productImage[1]); if (!product) return json(res, 404, { error: 'product_not_found' }); product.imageUrl = imageData; recordAudit(req, 'product.image_updated', 'product', product.id, null, { id: product.id, name: product.name, imageUrl: '[image]' }); return json(res, 200, product);
  }
  if (pathname === '/api/session') {
    const role = url.searchParams.get('role') || 'bartender';
    const persistedSession = await sessionFromRequest(req);
    const user = req.user || persistedSession?.user || { name: 'Демо сотрудник', role };
    return json(res, 200, { user, permissions: effectivePermissions(user), permissionScopes: normalizePermissionScopes(user.permissionScopes) });
  }
  if (pathname === '/api/staff' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'staff') && !hasPermission(req, 'settings') && !hasPermission(req, 'staff_view')) return json(res, 403, { error: 'forbidden', permission: 'staff' });
    if (repositories?.pool) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",permission_scopes AS "permissionScopes",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes" FROM users WHERE venue_id=$1 AND deleted_at IS NULL ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows }); } catch (_) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers" FROM users WHERE venue_id=$1 AND deleted_at IS NULL ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows.map((row) => ({ ...row, permissionScopes: [], employmentStartedAt: null, workNotes: '' })) }); } catch (_) { try { const { rows } = await repositories.pool.query(`SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl" FROM users WHERE venue_id=$1 AND deleted_at IS NULL ORDER BY full_name`, [venueDbId]); return json(res, 200, { items: rows.map((row) => ({ ...row, telegram: null, phoneNumbers: [], permissionScopes: [], employmentStartedAt: null, workNotes: '' })) }); } catch (_) {} } } }
    return json(res, 200, { items: staff.filter((person) => !person.deletedAt).map(({ passwordHash, ...person }) => { person.pinConfigured = Boolean(person.pinCode || person.pinHash || person.pinConfigured); if (!canSeeSensitiveStaff(req)) { delete person.passportData; delete person.pinCode; } if (!person.pinConfigured) delete person.pinUpdatedAt; return person; }) });
  }
  if (pathname === '/api/staff' && req.method === 'POST') {
    if (denyUnless(req, res, 'staff_manage')) return;
    const input = await body(req);
    if (!input.name || !rolePermissions[input.role] || input.role === 'owner') return json(res, 400, { error: 'name_and_valid_role_required' });
    if (input.login && !input.password && !input.pin) return json(res, 400, { error: 'password_or_pin_required' });
    if (input.password !== undefined && String(input.password).length < 6) return json(res, 400, { error: 'password_too_short' });
    if (input.pin !== undefined && !/^\d{4}$/.test(String(input.pin))) return json(res, 400, { error: 'invalid_staff_pin_format' });
    if (!canAssignStaffRole(req, input.role)) return json(res, 403, { error: 'staff_role_assignment_required' });
    const requestedScopes = normalizePermissionScopes(input.permissionScopes);
    if (input.permissionScopes !== undefined && (!Array.isArray(input.permissionScopes) || requestedScopes.length !== new Set(input.permissionScopes).size)) return json(res, 400, { error: 'invalid_permission_scopes' });
    if (input.permissionScopes !== undefined && process.env.AUTH_REQUIRED === 'true' && req.user?.role !== 'owner') return json(res, 403, { error: 'permission_scopes_owner_required' });
    if (input.permissionScopes !== undefined && input.role !== 'admin') return json(res, 400, { error: 'permission_scopes_admin_only' });
    const assignedScopes = input.role === 'admin' ? requestedScopes : [];
    if (!validEmploymentDate(input.employmentStartedAt)) return json(res, 400, { error: 'invalid_employment_date' });
    if (input.workNotes !== undefined && String(input.workNotes).length > 4000) return json(res, 400, { error: 'work_notes_too_long' });
    if (input.telegram && !/^(@[A-Za-z0-9_]{5,32}|https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$)/.test(String(input.telegram).trim())) return json(res, 400, { error: 'invalid_telegram' });
    if (input.phoneNumbers !== undefined && (!Array.isArray(input.phoneNumbers) || input.phoneNumbers.length > 5 || input.phoneNumbers.some((entry) => !entry || !/^\+?[0-9 ()-]{7,24}$/.test(String(entry.number || '').trim())))) return json(res, 400, { error: 'invalid_phone_numbers' });
    const contactNumbers = normalizePhoneNumbers(input.phoneNumbers);
    if (contactNumbers.length && contactNumbers.filter((entry) => entry.primary).length !== 1) return json(res, 400, { error: 'one_primary_phone_required' });
    const createdPassport = input.passportData !== undefined ? staffPassportCipher.encrypt(input.passportData) : null;
    if (input.passportData !== undefined && !canSeeSensitiveStaff(req)) return json(res, 403, { error: 'sensitive_staff_permission_required' });
    if (input.passportData !== undefined && !createdPassport) return json(res, 503, { error: 'staff_passport_key_required' });
    if (repositories?.pool) { try { const login = input.login || `user_${Date.now()}`; const passwordHash = input.password ? await hashPassword(input.password) : (input.pin ? await hashPassword(input.pin) : null); let rows; try { ({ rows } = await repositories.pool.query(`INSERT INTO users (venue_id,full_name,login,pin_hash,role,permission_scopes,avatar_url,telegram_url,phone_numbers,employment_started_at,work_notes,passport_data_encrypted,passport_data_iv,passport_data_tag) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING id,full_name AS name,login,role,permission_scopes AS "permissionScopes",is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes"`, [venueDbId, input.name, login, passwordHash, input.role, JSON.stringify(assignedScopes), input.avatarUrl || null, input.telegram || null, JSON.stringify(contactNumbers), input.employmentStartedAt || null, String(input.workNotes || '').slice(0, 4000), createdPassport?.data || null, createdPassport?.iv || null, createdPassport?.tag || null])); } catch (_) { ({ rows } = await repositories.pool.query(`INSERT INTO users (venue_id,full_name,login,pin_hash,role,avatar_url,telegram_url,phone_numbers,employment_started_at,work_notes,passport_data_encrypted,passport_data_iv,passport_data_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) RETURNING id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes"`, [venueDbId, input.name, login, passwordHash, input.role, input.avatarUrl || null, input.telegram || null, JSON.stringify(contactNumbers), input.employmentStartedAt || null, String(input.workNotes || '').slice(0, 4000), createdPassport?.data || null, createdPassport?.iv || null, createdPassport?.tag || null])); } const result = { ...rows[0], permissionScopes: rows[0].permissionScopes || assignedScopes, employmentStartedAt: input.employmentStartedAt || null, workNotes: String(input.workNotes || '').slice(0, 4000) }; recordAudit(req, 'staff.created', 'staff', rows[0].id, null, result); return json(res, 201, result); } catch (error) { return json(res, 409, { error: 'staff_create_failed', detail: error.message }); } }
    const person = { id: `u-${Date.now()}`, name: input.name, login: input.login || `user_${Date.now()}`, passwordHash: input.password ? await hashPassword(input.password) : (input.pin ? await hashPassword(input.pin) : null), role: input.role, active: true, avatarUrl: input.avatarUrl || null, telegram: input.telegram || null, phoneNumbers: contactNumbers, permissionScopes: assignedScopes, employmentStartedAt: input.employmentStartedAt || null, workNotes: String(input.workNotes || '').slice(0, 4000), passportData: input.passportData || null, pinCode: input.pin || null, pinConfigured: Boolean(input.pin), pinUpdatedAt: input.pin ? new Date().toISOString() : null };
    staff.push(person);
    const { passwordHash, ...publicPerson } = person;
    recordAudit(req, 'staff.created', 'staff', person.id, null, publicPerson);
    return json(res, 201, publicPerson);
  }
  const staffStatus = pathname.match(/^\/api\/staff\/([^/]+)\/status$/);
  if (staffStatus && req.method === 'PATCH') {
    if (denyUnless(req, res, 'staff_manage')) return;
    const input = await body(req); if (typeof input.active !== 'boolean') return json(res, 400, { error: 'active_boolean_required' });
    if (String(req.user?.id || '') === staffStatus[1] && !input.active) return json(res, 409, { error: 'self_deactivation_forbidden' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffStatus[1])) { try { const { rows } = await repositories.pool.query(`UPDATE users SET is_active=$1 WHERE id=$2 AND venue_id=$3 AND role <> 'owner' AND deleted_at IS NULL RETURNING id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl"`, [input.active, staffStatus[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'staff_not_found_or_archived_or_owner' }); recordAudit(req, input.active ? 'staff.activated' : 'staff.deactivated', 'staff', rows[0].id, { active: !input.active }, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_status_update_failed', detail: error.message }); } }
    const person = staff.find((entry) => entry.id === staffStatus[1]); if (!person || person.role === 'owner' || person.deletedAt) return json(res, 404, { error: 'staff_not_found_or_archived_or_owner' }); const before = { active: person.active }; person.active = input.active; recordAudit(req, input.active ? 'staff.activated' : 'staff.deactivated', 'staff', person.id, before, { active: person.active }); return json(res, 200, person);
  }
  const staffDelete = pathname.match(/^\/api\/staff\/([^/]+)$/);
  if (staffDelete && req.method === 'DELETE') {
    if (denyUnless(req, res, 'staff_manage')) return;
    if (String(req.user?.id || '') === staffDelete[1]) return json(res, 409, { error: 'self_deactivation_forbidden' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffDelete[1])) { try { const { rows } = await repositories.pool.query(`UPDATE users SET is_active=false WHERE id=$1 AND venue_id=$2 AND role <> 'owner' AND is_active=true RETURNING id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl"`, [staffDelete[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'staff_not_found_or_owner' }); recordAudit(req, 'staff.deactivated', 'staff', rows[0].id, { active: true }, { active: false }); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_delete_failed', detail: error.message }); } }
    const person = staff.find((entry) => entry.id === staffDelete[1]);
    if (!person) return json(res, 404, { error: 'staff_not_found' });
    if (person.role === 'owner') return json(res, 409, { error: 'owner_cannot_be_deleted' });
    if (!person.active) return json(res, 409, { error: 'staff_already_inactive' });
    person.active = false; recordAudit(req, 'staff.deactivated', 'staff', person.id, { active: true }, { active: false });
    return json(res, 200, person);
  }
  const staffArchive = pathname.match(/^\/api\/staff\/([^/]+)\/archive$/);
  if (staffArchive && req.method === 'POST') {
    if (denyUnless(req, res, 'staff_manage')) return;
    if (process.env.AUTH_REQUIRED === 'true' && req.user?.role !== 'owner') return json(res, 403, { error: 'staff_archive_owner_required' });
    if (String(req.user?.id || '') === staffArchive[1]) return json(res, 409, { error: 'self_archive_forbidden' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffArchive[1])) {
      try {
        const { rows } = await repositories.pool.query(`UPDATE users SET is_active=false,deleted_at=now() WHERE id=$1 AND venue_id=$2 AND role <> 'owner' AND is_active=false AND deleted_at IS NULL RETURNING id,full_name AS name,role,is_active AS active,deleted_at AS "archivedAt"`, [staffArchive[1], venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'staff_not_found_or_owner' });
        recordAudit(req, 'staff.archived', 'staff', rows[0].id, { active: true }, { active: false, archivedAt: rows[0].archivedAt });
        return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'staff_archive_failed', detail: error.message }); }
    }
    const index = staff.findIndex((person) => person.id === staffArchive[1]);
    const person = staff[index];
    if (!person || person.role === 'owner' || person.active || person.deletedAt) return json(res, 409, { error: 'staff_must_be_blocked_before_archive' });
    person.active = false; person.deletedAt = new Date().toISOString();
    recordAudit(req, 'staff.archived', 'staff', person.id, { active: true }, { active: false, archivedAt: person.deletedAt });
    return json(res, 200, { id: person.id, name: person.name, role: person.role, active: false, archivedAt: person.deletedAt });
  }
  const staffAvatar = pathname.match(/^\/api\/staff\/([^/]+)\/avatar$/);
  if (staffAvatar && req.method === 'POST') {
    if (!hasPermission(req, 'staff_manage') && String(req.user?.id || '') !== staffAvatar[1]) return json(res, 403, { error: 'forbidden', permission: 'staff' });
    const input = await body(req); if (!validImageData(input.imageData)) return json(res, 400, { error: 'invalid_avatar' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(staffAvatar[1])) { try { const { rows } = await repositories.pool.query(`UPDATE users SET avatar_url=$1 WHERE id=$2 AND venue_id=$3 RETURNING id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl"`, [input.imageData, staffAvatar[1], venueDbId]); if (!rows[0]) return json(res, 404, { error: 'staff_not_found' }); recordAudit(req, 'staff.avatar_updated', 'staff', rows[0].id, { avatarUrl: '[image]' }, { avatarUrl: '[image]' }); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'staff_avatar_failed', detail: error.message }); } }
    const person = staff.find((entry) => entry.id === staffAvatar[1]); if (!person) return json(res, 404, { error: 'staff_not_found' });
    const hadAvatar = Boolean(person.avatarUrl); person.avatarUrl = input.imageData; recordAudit(req, 'staff.avatar_updated', 'staff', person.id, { avatarUrl: hadAvatar ? '[image]' : null }, { avatarUrl: '[image]' }); return json(res, 200, person);
  }
  const staffProfile = pathname.match(/^\/api\/staff\/([^/]+)\/profile$/);
  const staffPinPath = pathname.match(/^\/api\/staff\/([^/]+)\/pin$/);
  if (staffPinPath && req.method === 'PATCH') {
    const personId = staffPinPath[1]; const isSelf = String(req.user?.id || '') === personId;
    if (!isSelf && denyUnless(req, res, 'staff_manage')) return;
    const input = await body(req); const pin = String(input.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) return json(res, 400, { error: 'invalid_staff_pin_format' });
    const memoryPerson = staff.find((entry) => entry.id === personId);
    if (memoryPerson) {
      if (!memoryPerson.active || memoryPerson.deletedAt) return json(res, 404, { error: 'staff_not_found' });
      memoryPerson.passwordHash = await hashPassword(pin); memoryPerson.pinCode = pin; memoryPerson.pinConfigured = true; memoryPerson.pinUpdatedAt = new Date().toISOString();
      const notification = { id: `staff-pin-${Date.now()}`, type: 'staff_pin_updated', staffId: personId, staffName: memoryPerson.name, actor: req.user?.name || 'сотрудник', createdAt: memoryPerson.pinUpdatedAt, notificationRecipients: ['owner', 'admin'] };
      staffNotifications.push(notification); recordAudit(req, 'staff.pin_updated', 'staff', personId, { pinConfigured: true }, { pinConfigured: true, notificationRecipients: ['owner', 'admin'] });
      return json(res, 200, { id: personId, pinConfigured: true, pinUpdatedAt: memoryPerson.pinUpdatedAt });
    }
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(personId)) {
      const encrypted = staffPinCipher.encrypt(pin); if (!encrypted) return json(res, 503, { error: 'staff_pin_key_required' });
      try {
        const { rows } = await repositories.pool.query('UPDATE users SET pin_hash=$1,pin_data_encrypted=$2,pin_data_iv=$3,pin_data_tag=$4,pin_updated_at=now() WHERE id=$5 AND venue_id=$6 AND is_active=true AND deleted_at IS NULL RETURNING id,full_name AS name,pin_updated_at AS "pinUpdatedAt"', [await hashPassword(pin), encrypted.data, encrypted.iv, encrypted.tag, personId, venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
        recordAudit(req, 'staff.pin_updated', 'staff', personId, { pinConfigured: true }, { pinConfigured: true, notificationRecipients: ['owner', 'admin'] });
        return json(res, 200, { id: rows[0].id, pinConfigured: true, pinUpdatedAt: rows[0].pinUpdatedAt });
      } catch (error) { return json(res, 409, { error: 'staff_pin_save_failed', detail: error.message }); }
    }
    return json(res, 404, { error: 'staff_not_found' });
  }
if (staffProfile && req.method === 'GET') {
  const personId = staffProfile[1];
  const canRead = hasPermission(req, 'staff') || hasPermission(req, 'staff_view') || String(req.user?.id || '') === personId;
  if (!canRead) return json(res, 403, { error: 'forbidden', permission: 'staff_view' });
  if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(personId)) {
    try {
      const { rows } = await repositories.pool.query('SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",permission_scopes AS "permissionScopes",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes",passport_data_encrypted,passport_data_iv,passport_data_tag FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
      if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
      const profile = { ...rows[0], workspacePermissions: effectivePermissions({ role: rows[0].role, permissionScopes: rows[0].permissionScopes }) };
      if (canSeeSensitiveStaff(req)) profile.passportData = staffPassportCipher.decrypt(rows[0]);
      delete profile.passport_data_encrypted; delete profile.passport_data_iv; delete profile.passport_data_tag;
      return json(res, 200, profile);
    } catch (error) {
      // Keep migration 002 contact data available when the employment migration is not applied yet.
      try {
        const { rows } = await repositories.pool.query('SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",passport_data_encrypted,passport_data_iv,passport_data_tag FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
        const profile = { ...rows[0], permissionScopes: [], employmentStartedAt: null, workNotes: '', workspacePermissions: effectivePermissions({ role: rows[0].role, permissionScopes: [] }) };
        if (canSeeSensitiveStaff(req)) profile.passportData = staffPassportCipher.decrypt(rows[0]);
        delete profile.passport_data_encrypted; delete profile.passport_data_iv; delete profile.passport_data_tag;
        return json(res, 200, profile);
      } catch (_) {
        try {
          const { rows } = await repositories.pool.query('SELECT id,full_name AS name,login,role,is_active AS active,avatar_url AS "avatarUrl" FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
          if (!rows[0]) return json(res, 404, { error: 'staff_not_found' });
          return json(res, 200, { ...rows[0], telegram: null, phoneNumbers: [], permissionScopes: [], employmentStartedAt: null, workNotes: '', workspacePermissions: effectivePermissions({ role: rows[0].role, permissionScopes: [] }) });
        } catch (fallbackError) { return json(res, 409, { error: 'staff_profile_read_failed', detail: fallbackError.message }); }
      }
    }
  }
  const person = staff.find((entry) => entry.id === personId);
  if (!person) return json(res, 404, { error: 'staff_not_found' });
  const profile = { ...person, workspacePermissions: effectivePermissions(person) }; if (!canSeeSensitiveStaff(req)) delete profile.passportData;
  return json(res, 200, profile);
}
if (staffProfile && req.method === 'PATCH') {
  const personId = staffProfile[1];
  const canManage = hasPermission(req, 'staff_manage');
  const canManageSensitive = canSeeSensitiveStaff(req);
  const isSelf = String(req.user?.id || '') === personId;
  if (!canManage && !isSelf) return json(res, 403, { error: 'forbidden', permission: 'staff' });
  const input = await body(req);
  const memoryPerson = staff.find((entry) => entry.id === personId);
  let before = memoryPerson ? { ...memoryPerson, phoneNumbers: Array.isArray(memoryPerson.phoneNumbers) ? memoryPerson.phoneNumbers.map((phone) => ({ ...phone })) : [] } : null;
  if (!before && repositories?.pool && /^[0-9a-f-]{36}$/i.test(personId)) {
    try {
      const { rows } = await repositories.pool.query('SELECT id,full_name AS name,role,is_active AS active,avatar_url AS "avatarUrl",telegram_url AS telegram,phone_numbers AS "phoneNumbers",permission_scopes AS "permissionScopes",employment_started_at AS "employmentStartedAt",work_notes AS "workNotes" FROM users WHERE id=$1 AND venue_id=$2 LIMIT 1', [personId, venueDbId]);
      before = rows[0] || null;
    } catch (_) {}
  }
  if (!before) return json(res, 404, { error: 'staff_not_found' });
  if (before.role === 'owner' && req.user?.role !== 'owner') return json(res, 403, { error: 'owner_staff_protected' });
  const auditBefore = { ...before, phoneNumbers: Array.isArray(before.phoneNumbers) ? before.phoneNumbers.map((phone) => ({ ...phone })) : [] };
  if (!canManageSensitive) delete auditBefore.passportData;
  if (input.name !== undefined && !canManage) return json(res, 403, { error: 'staff_management_required' });
  if (input.role !== undefined && !canManage) return json(res, 403, { error: 'staff_management_required' });
  if (input.name !== undefined && (!String(input.name).trim() || String(input.name).trim().length > 120)) return json(res, 400, { error: 'invalid_staff_name' });
  if (input.role !== undefined && (!rolePermissions[input.role] || input.role === 'owner')) return json(res, 400, { error: 'invalid_staff_role' });
  if (input.role !== undefined && !canAssignStaffRole(req, input.role)) return json(res, 403, { error: 'staff_role_assignment_required' });
  if (input.permissionScopes !== undefined && (!Array.isArray(input.permissionScopes) || normalizePermissionScopes(input.permissionScopes).length !== new Set(input.permissionScopes).size)) return json(res, 400, { error: 'invalid_permission_scopes' });
  if (input.permissionScopes !== undefined && process.env.AUTH_REQUIRED === 'true' && req.user?.role !== 'owner') return json(res, 403, { error: 'permission_scopes_owner_required' });
  if (input.permissionScopes !== undefined && before.role !== 'admin') return json(res, 400, { error: 'permission_scopes_admin_only' });
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
  if (input.permissionScopes !== undefined) before.permissionScopes = normalizePermissionScopes(input.permissionScopes);
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
      if (input.permissionScopes !== undefined) { try { await repositories.pool.query('UPDATE users SET permission_scopes=$1::jsonb WHERE id=$2 AND venue_id=$3', [JSON.stringify(before.permissionScopes || []), personId, venueDbId]); } catch (_) {} }
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
      const movement = await repositories.inventory.move({ venueId: venueDbId, ingredientId: item.id, direction: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), reason: input.reason, createdBy: /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : null });
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
    const date = url.searchParams.get('date') || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'invalid_finance_date' });
    if (repositories?.pool) {
      try {
        const totals = await repositories.pool.query(`
          SELECT COALESCE(SUM(p.amount), 0) AS revenue, COUNT(DISTINCT o.id)::int AS closed_orders, COUNT(p.id)::int AS payment_count
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
        const pendingTotals = await repositories.pool.query(`WITH item_totals AS (SELECT order_id, COALESCE(SUM(quantity * unit_price),0) AS subtotal FROM order_items GROUP BY order_id), discount_totals AS (SELECT order_id, COALESCE(SUM(CASE WHEN type='percent' THEN (SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0) FROM order_items oi WHERE oi.order_id=d.order_id) * LEAST(100,GREATEST(0,value))/100 ELSE GREATEST(0,value) END),0) AS discount FROM discounts d WHERE status='approved' GROUP BY order_id), paid_totals AS (SELECT order_id, COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','partially_paid')),0) AS paid FROM payments GROUP BY order_id) SELECT COUNT(*)::int AS pending_orders, COALESCE(SUM(GREATEST(0, GREATEST(COALESCE(o.vip_minimum,0),COALESCE(i.subtotal,0)-COALESCE(d.discount,0))-COALESCE(p.paid,0))),0) AS pending_revenue FROM orders o LEFT JOIN item_totals i ON i.order_id=o.id LEFT JOIN discount_totals d ON d.order_id=o.id LEFT JOIN paid_totals p ON p.order_id=o.id WHERE o.venue_id=$1 AND o.status IN ('open','in_progress','ready')`, [venueDbId]);
        const shiftStats = await repositories.pool.query(`SELECT COALESCE(SUM(p.amount),0) AS revenue, COUNT(DISTINCT o.id)::int AS orders FROM orders o JOIN payments p ON p.order_id=o.id CROSS JOIN (SELECT opened_at FROM shifts WHERE venue_id=$1 AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1) s WHERE o.venue_id=$1 AND o.status='closed' AND o.closed_at >= s.opened_at AND p.status IN ('paid','partially_paid')`, [venueDbId]);
        const row = totals.rows[0] || { revenue: 0, closed_orders: 0, payment_count: 0 }; const shiftRow = shiftStats.rows[0] || { revenue: 0, orders: 0 }; const shiftRevenue = Number(shiftRow.revenue || 0); const shiftOrders = Number(shiftRow.orders || 0);
        return json(res, 200, { date, revenue: Number(row.revenue || 0), closedOrders: Number(row.closed_orders || 0), paymentCount: Number(row.payment_count || 0), byPaymentMethod: Object.fromEntries(methods.rows.map((entry) => [entry.method, Number(entry.amount || 0)])), currentShiftOrders: shiftOrders, currentShiftAverageCheck: shiftOrders ? shiftRevenue / shiftOrders : 0, pendingOrders: Number(pendingTotals.rows[0]?.pending_orders || 0), pendingRevenue: Number(pendingTotals.rows[0]?.pending_revenue || 0), pendingDiscounts: Number(pending.rows[0]?.count || 0) });
      } catch (error) {
        return json(res, 503, { error: 'database_unavailable', detail: error.message });
      }
    }
    const closed = orders.filter((order) => order.status === 'closed' && businessDateKey(order.closedAt || order.createdAt) === date);
    const byType = {}; let revenue = 0; let paymentCount = 0;
    closed.forEach((order) => { const payments = (order.payments || []).filter((payment) => payment.status === 'paid'); if (payments.length) payments.forEach((payment) => { const amount = Number(payment.amount || 0); paymentCount += 1; revenue += amount; const key = payment.method || 'не указан'; byType[key] = (byType[key] || 0) + amount; }); else { const amount = Number(order.finalTotal || orderTotal(order)); revenue += amount; const key = order.paymentMethod || 'не указан'; byType[key] = (byType[key] || 0) + amount; } });
    const pending = pendingPaymentSummary(); const currentShift = shifts.find((shift) => !shift.closedAt); const shiftClosed = currentShift ? closed.filter((order) => new Date(order.closedAt || 0) >= new Date(currentShift.openedAt)) : []; const shiftRevenue = shiftClosed.reduce((sum, order) => sum + (order.payments || []).filter((payment) => ['paid', 'partially_paid'].includes(payment.status)).reduce((total, payment) => total + Number(payment.amount || 0), 0), 0); return json(res, 200, { date, revenue, closedOrders: closed.length, paymentCount, byPaymentMethod: byType, currentShiftOrders: shiftClosed.length, currentShiftAverageCheck: shiftClosed.length ? shiftRevenue / shiftClosed.length : 0, pendingOrders: pending.pendingOrders, pendingRevenue: pending.pendingRevenue, pendingDiscounts: discountRequests.filter((request) => request.status === 'requested').length });
  }
  if (pathname === '/api/finance/report' && req.method === 'GET') {
    if (process.env.AUTH_REQUIRED === 'true' && !hasPermission(req, 'finance') && !hasPermission(req, 'finance_read')) return json(res, 403, { error: 'forbidden', permission: 'finance_read' });
    const date = url.searchParams.get('date') || today();
    const type = url.searchParams.get('type') === 'waiter' ? 'waiter' : 'x';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'invalid_finance_date' });
    const reportNumber = `R-${date.replace(/-/g, '')}-${type.toUpperCase()}-${String(Date.now()).slice(-6)}`;
    const byPaymentMethod = {}; const byStation = {}; const byStaff = {}; let revenue = 0; let paymentCount = 0; let closedOrders = [];
    const addOrder = (order) => {
      const payments = (order.payments || []).filter((payment) => payment.status === 'paid');
      if (payments.length) payments.forEach((payment) => { const amount = Number(payment.amount || 0); revenue += amount; paymentCount += 1; const key = payment.method || 'не указан'; byPaymentMethod[key] = (byPaymentMethod[key] || 0) + amount; });
      else { const amount = Number(order.finalTotal || orderTotal(order)); revenue += amount; const key = order.paymentMethod || 'не указан'; byPaymentMethod[key] = (byPaymentMethod[key] || 0) + amount; paymentCount += amount > 0 ? 1 : 0; }
      (order.items || []).forEach((item) => { const station = item.station || 'other'; byStation[station] = (byStation[station] || 0) + Number(item.unitPrice || item.price || 0) * Number(item.quantity || 0); });
      const staffName = order.createdByName || order.waiterName || order.cashierName || 'Не указан'; byStaff[staffName] = (byStaff[staffName] || 0) + Number(order.finalTotal || orderTotal(order));
    };
    if (repositories?.pool) {
      try {
        const { rows } = await repositories.pool.query(`SELECT o.id,o.created_at AS "createdAt",o.closed_at AS "closedAt",COALESCE(u.full_name,u.login,'Не указан') AS "createdByName",COALESCE(json_agg(json_build_object('method',p.method,'amount',p.amount,'status',p.status)) FILTER (WHERE p.id IS NOT NULL),'[]') AS payments FROM orders o LEFT JOIN payments p ON p.order_id=o.id LEFT JOIN users u ON u.id=o.opened_by WHERE o.venue_id=$1 AND o.status='closed' AND o.closed_at >= $2::date AND o.closed_at < ($2::date + INTERVAL '1 day') GROUP BY o.id,u.full_name,u.login ORDER BY o.closed_at`, [venueDbId, date]);
        closedOrders = rows.map((row) => ({ ...row, payments: row.payments || [], items: [] }));
        const itemRows = await repositories.pool.query(`SELECT oi.order_id AS "orderId",oi.quantity,oi.unit_price AS "unitPrice",COALESCE(oi.station,'other') AS station FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.venue_id=$1 AND o.status='closed' AND o.closed_at >= $2::date AND o.closed_at < ($2::date + INTERVAL '1 day')`, [venueDbId, date]);
        const itemsByOrder = new Map(); itemRows.rows.forEach((item) => { if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []); itemsByOrder.get(item.orderId).push(item); }); closedOrders.forEach((order) => { order.items = itemsByOrder.get(order.id) || []; addOrder(order); });
      } catch (error) { return json(res, 503, { error: 'database_unavailable', detail: error.message }); }
    } else { closedOrders = orders.filter((order) => order.status === 'closed' && businessDateKey(order.closedAt || order.createdAt) === date); closedOrders.forEach(addOrder); }
    const report = { type, date, generatedAt: new Date().toISOString(), reportNumber, cashier: req.user?.name || 'Кассир', checksCount: closedOrders.length, closedOrders: closedOrders.length, paymentCount, revenue: Math.round(revenue * 100) / 100, cash: Math.round(Number(byPaymentMethod.cash || 0) * 100) / 100, card: Math.round(Number(byPaymentMethod.card || 0) * 100) / 100, qr: Math.round(Number(byPaymentMethod.qr || 0) * 100) / 100, byPaymentMethod, byStation, byStaff: type === 'waiter' ? byStaff : undefined };
    recordAudit(req, 'finance.report_generated', 'finance_report', reportNumber, null, { type, date, checksCount: report.checksCount, revenue: report.revenue });
    return json(res, 200, report);
  }
  if (pathname === '/api/deliveries' && req.method === 'GET') {
    if (denyUnless(req, res, 'delivery')) return;
    return json(res, 200, { items: deliveries.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  }
  if (pathname === '/api/deliveries' && req.method === 'POST') {
    if (denyUnless(req, res, 'delivery')) return;
    const input = await body(req); const customerName = String(input.customerName || '').trim(); const phone = String(input.phone || '').trim(); const address = String(input.address || '').trim(); const total = Number(input.total || 0);
    if (!customerName || customerName.length > 120 || !address || address.length > 500) return json(res, 400, { error: 'delivery_contact_required' });
    if (phone && !/^\+?[0-9 ()-]{7,24}$/.test(phone)) return json(res, 400, { error: 'invalid_guest_phone' });
    if (!Number.isFinite(total) || total < 0) return json(res, 400, { error: 'invalid_delivery_total' });
    const delivery = { id: `delivery-${Date.now()}`, customerName, phone, address, comment: String(input.comment || '').trim().slice(0, 500), total, paymentMethod: ['cash', 'card', 'qr'].includes(input.paymentMethod) ? input.paymentMethod : 'cash', status: 'new', courier: '', createdAt: new Date().toISOString() };
    deliveries.push(delivery); recordAudit(req, 'delivery.created', 'delivery', delivery.id, null, delivery); return json(res, 201, delivery);
  }
  const deliveryPath = pathname.match(/^\/api\/deliveries\/([^/]+)$/);
  if (deliveryPath && req.method === 'PATCH') {
    if (denyUnless(req, res, 'delivery')) return;
    const delivery = deliveries.find((entry) => entry.id === deliveryPath[1]); if (!delivery) return json(res, 404, { error: 'delivery_not_found' }); const input = await body(req); const allowed = ['new', 'confirmed', 'in_delivery', 'delivered', 'cancelled']; if (input.status !== undefined && !allowed.includes(input.status)) return json(res, 400, { error: 'invalid_delivery_status' }); const before = { ...delivery }; if (input.status !== undefined) delivery.status = input.status; if (input.courier !== undefined) delivery.courier = String(input.courier || '').trim().slice(0, 120); recordAudit(req, 'delivery.updated', 'delivery', delivery.id, before, delivery); return json(res, 200, delivery);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) || !/^\d{2}:\d{2}$/.test(String(input.time)) || Number.isNaN(Date.parse(`${input.date}T${input.time}:00`)) || Date.parse(`${input.date}T${input.time}:00`) <= Date.now()) return json(res, 400, { error: 'invalid_reservation_datetime' });
    if (input.phone && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone).trim())) return json(res, 400, { error: 'invalid_guest_phone' });
    if (!Number.isInteger(Number(input.guests || 1)) || Number(input.guests || 1) < 1 || Number(input.guests || 1) > 50) return json(res, 400, { error: 'invalid_guest_count' });
    let tableMinimum = 0;
    let tableName = input.tableId;
    let table = null;
    if (repositories?.pool) {
      try {
        const { rows } = await repositories.pool.query('SELECT name,status,min_order_total AS "minimumOrderTotal" FROM tables WHERE id=$1 AND venue_id=$2', [input.tableId, venueDbId]);
        if (!rows[0]) return json(res, 400, { error: 'table_not_found' });
        tableName = rows[0].name;
        if (rows[0].status === 'blocked') return json(res, 409, { error: 'table_unavailable' });
        tableMinimum = Number(rows[0].minimumOrderTotal || 0);
      } catch (error) { return json(res, 409, { error: 'reservation_table_lookup_failed', detail: error.message }); }
    } else {
      table = floor.flatMap((zone) => zone.tables).find((entry) => entry.id === input.tableId);
      if (!table) return json(res, 400, { error: 'table_not_found' });
      tableName = table.name;
      if (table.status === 'blocked') return json(res, 409, { error: 'table_unavailable' });
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
    if (repositories?.pool) { try { const reservation = await repositories.reservations.create({ ...input, tableName, deposit, venueId: venueDbId }); recordAudit(req, 'reservation.created', 'reservation', reservation.id, null, reservation); return json(res, 201, reservation); } catch (error) { return json(res, 409, { error: 'reservation_create_failed', detail: error.message }); } }
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
        const { rows } = await repositories.pool.query(`UPDATE reservations SET status='cancelled' WHERE id=$1 AND venue_id=$2 AND status='confirmed' RETURNING id,table_id AS "tableId",starts_at AS "startsAt",status`, [reservationId, venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'reservation_not_found_or_cancelled' });
        await repositories.pool.query(`UPDATE tables SET status=CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.table_id=$1 AND o.venue_id=$2 AND o.status IN ('open','in_progress','ready')) THEN 'occupied' ELSE 'free' END WHERE id=$1 AND venue_id=$2 AND status <> 'blocked' AND NOT EXISTS (SELECT 1 FROM reservations WHERE table_id=$1 AND venue_id=$2 AND status='confirmed' AND starts_at::date=$3::date)`, [rows[0].tableId, venueDbId, rows[0].startsAt]);
        recordAudit(req, 'reservation.cancelled', 'reservation', rows[0].id, { status: 'confirmed' }, rows[0]);
        return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'reservation_cancel_failed', detail: error.message }); }
    }
    const reservation = reservations.find((entry) => entry.id === pathname.split('/')[3]);
    if (!reservation) return json(res, 404, { error: 'reservation_not_found' });
    reservation.status = 'cancelled';
    const stillReserved = reservations.some((entry) => entry.id !== reservation.id && entry.status === 'confirmed' && entry.tableId === reservation.tableId && entry.date === reservation.date);
    if (!stillReserved) { const activeOrder = orders.some((order) => order.tableId === reservation.tableId && ['open', 'in_progress', 'ready'].includes(order.status)); setMemoryTableStatus(reservation.tableId, activeOrder ? 'occupied' : 'free'); }
    recordAudit(req, 'reservation.cancelled', 'reservation', reservation.id, { status: 'confirmed' }, reservation);
    return json(res, 200, reservation);
  }
  if (pathname === '/api/orders' && req.method === 'GET') {
    if (denyUnless(req, res, 'orders')) return;
    if (orderRepository) {
      try { return json(res, 200, { items: await orderRepository.listOpen(venueDbId, url.searchParams.get('scope') === 'all') }); } catch (_) { return json(res, 503, { error: 'database_unavailable' }); }
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
    if (input.tableId && orders.some((entry) => entry.tableId === input.tableId && ['open', 'in_progress', 'ready'].includes(entry.status))) return json(res, 409, { error: 'table_has_active_order' });
    const order = { id: `ord-${Date.now()}`, tableId: input.tableId || null, status: 'open', orderType: input.orderType || 'regular', minimumOrderTotal, notes: input.notes || '', items: [], createdByName: req.user?.name || 'сотрудник', createdAt: new Date().toISOString() };
    orders.push(order);
    setMemoryTableStatus(order.tableId, 'occupied');
    recordAudit(req, 'order.created', 'order', order.id, null, order);
    return json(res, 201, order);
  }
  const orderEdit = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderEdit && req.method === 'PATCH') {
    if (denyUnless(req, res, 'orders')) return;
    const input = await body(req); if (input.notes === undefined && input.guestName === undefined && input.phone === undefined && input.clientId === undefined) return json(res, 400, { error: 'supported_fields_required' });
    if (input.clientId !== undefined && input.clientId !== null && String(input.clientId).length > 120) return json(res, 400, { error: 'invalid_client_id' });
    if (input.phone !== undefined && input.phone && !/^\+?[0-9 ()-]{7,24}$/.test(String(input.phone).trim())) return json(res, 400, { error: 'invalid_guest_phone' });
    if (input.guestName !== undefined && String(input.guestName).trim().length > 120) return json(res, 400, { error: 'guest_name_too_long' });
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(orderEdit[1])) {
      try {
        const { rows: currentRows } = await repositories.pool.query('SELECT status FROM orders WHERE id=$1 AND venue_id=$2', [orderEdit[1], venueDbId]);
        if (!currentRows[0]) return json(res, 404, { error: 'order_not_found' });
        if (!['open', 'in_progress', 'ready'].includes(currentRows[0].status)) return json(res, 409, { error: 'order_not_editable' });
        let guest = null;
        if (input.clientId !== undefined && input.clientId !== null && String(input.clientId).trim()) {
          const { rows } = await repositories.pool.query('SELECT id,phone,full_name AS "name" FROM guests WHERE id=$1 AND venue_id=$2', [String(input.clientId), venueDbId]);
          if (!rows[0]) return json(res, 404, { error: 'client_not_found' });
          guest = rows[0];
          await repositories.pool.query('UPDATE orders SET guest_id=$1 WHERE id=$2 AND venue_id=$3', [guest.id, orderEdit[1], venueDbId]);
        } else if (input.guestName !== undefined || input.phone !== undefined) {
          const { rows } = await repositories.pool.query(`INSERT INTO guests (venue_id,phone,full_name) VALUES ($1,$2,$3) ON CONFLICT (venue_id,phone) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id,phone,full_name AS "name"`, [venueDbId, String(input.phone || '').trim() || null, String(input.guestName || '').trim() || null]);
          guest = rows[0];
          await repositories.pool.query('UPDATE orders SET guest_id=$1 WHERE id=$2 AND venue_id=$3', [guest.id, orderEdit[1], venueDbId]);
        }
        if (input.notes !== undefined) await repositories.pool.query('UPDATE orders SET notes=$1 WHERE id=$2 AND venue_id=$3', [String(input.notes).slice(0, 2000), orderEdit[1], venueDbId]);
        const { rows } = await repositories.pool.query(`SELECT o.id,o.notes,o.guest_id AS "guestId",g.phone,g.full_name AS "guestName" FROM orders o LEFT JOIN guests g ON g.id=o.guest_id WHERE o.id=$1 AND o.venue_id=$2`, [orderEdit[1], venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'order_not_found' });
        recordAudit(req, guest ? 'order.guest_updated' : 'order.notes_updated', 'order', rows[0].id, null, rows[0]); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_update_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderEdit[1]); if (!order) return json(res, 404, { error: 'order_not_found' }); if (!['open', 'in_progress', 'ready'].includes(order.status)) return json(res, 409, { error: 'order_not_editable' });
    if (input.notes !== undefined) order.notes = String(input.notes).slice(0, 2000);
    if (input.clientId !== undefined && input.clientId !== null && String(input.clientId).trim()) { const client = clients.find((entry) => entry.id === String(input.clientId)); if (!client) return json(res, 404, { error: 'client_not_found' }); order.clientId = client.id; order.guestName = client.name; order.guestPhone = client.phoneNumbers?.find((phone) => phone.primary)?.number || client.phoneNumbers?.[0]?.number || ''; } else if (input.guestName !== undefined || input.phone !== undefined) { order.clientId = null; order.guestName = String(input.guestName || '').trim(); order.guestPhone = String(input.phone || '').trim(); }
    recordAudit(req, input.clientId !== undefined || input.guestName !== undefined || input.phone !== undefined ? 'order.guest_updated' : 'order.notes_updated', 'order', order.id, null, { notes: order.notes, clientId: order.clientId || null, guestName: order.guestName, guestPhone: order.guestPhone }); return json(res, 200, order);
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
           const { rows: currentRows } = await repositories.pool.query('SELECT id,status,table_id AS "tableId" FROM orders WHERE id=$1 AND venue_id=$2', [orderAction[1], venueDbId]);
           if (!currentRows[0]) return json(res, 404, { error: 'order_not_found' });
           if (!validOrderTransition(currentRows[0].status, input.status)) return json(res, 409, { error: 'invalid_order_transition', from: currentRows[0].status, to: input.status });
           const { rows } = await repositories.pool.query('UPDATE orders SET status=$1,closed_at=CASE WHEN $1=\'closed\' THEN now() ELSE closed_at END WHERE id=$2 AND venue_id=$3 RETURNING id,status,table_id AS "tableId"', [input.status, orderAction[1], venueDbId]);
           if (['closed', 'cancelled'].includes(input.status) && rows[0].tableId) await repositories.pool.query(`UPDATE tables SET status=CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=$1 AND r.venue_id=$2 AND r.status='confirmed' AND r.starts_at::date=CURRENT_DATE) THEN 'reserved' ELSE 'free' END WHERE id=$1 AND venue_id=$2 AND status <> 'blocked' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_id=$1 AND o.venue_id=$2 AND o.status IN ('open','in_progress','ready'))`, [rows[0].tableId, venueDbId]);
          recordAudit(req, 'order.status_changed', 'order', rows[0].id, { status: currentRows[0].status, tableId: rows[0].tableId }, rows[0]); return json(res, 200, rows[0]);
        }
        if (typeof input.tableId !== 'string' || !input.tableId.trim() || input.tableId.length > 80) return json(res, 400, { error: 'table_id_required' });
        const { rows: beforeRows } = await repositories.pool.query('SELECT table_id AS "tableId",status FROM orders WHERE id=$1 AND venue_id=$2', [orderAction[1], venueDbId]);
        const occupied = await repositories.pool.query(`SELECT id FROM orders WHERE venue_id=$1 AND table_id=$2 AND id<>$3 AND status IN ('open','in_progress','ready') LIMIT 1`, [venueDbId, input.tableId, orderAction[1]]);
        if (occupied.rows[0]) return json(res, 409, { error: 'target_table_has_active_order' });
        const { rows } = await repositories.pool.query('UPDATE orders SET table_id=$1 WHERE id=$2 AND venue_id=$3 RETURNING id,status,table_id AS "tableId"', [input.tableId, orderAction[1], venueDbId]);
        if (!rows[0]) return json(res, 404, { error: 'order_not_found' });
        if (beforeRows[0]?.tableId && beforeRows[0].tableId !== rows[0].tableId) { await repositories.pool.query(`UPDATE tables SET status=CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=$1 AND r.venue_id=$2 AND r.status='confirmed' AND r.starts_at::date=CURRENT_DATE) THEN 'reserved' ELSE 'free' END WHERE id=$1 AND venue_id=$2 AND status <> 'blocked' AND NOT EXISTS (SELECT 1 FROM orders WHERE table_id=$1 AND venue_id=$2 AND status IN ('open','in_progress','ready'))`, [beforeRows[0].tableId, venueDbId]); await repositories.pool.query(`UPDATE tables SET status='occupied' WHERE id=$1 AND venue_id=$2 AND status <> 'blocked'`, [rows[0].tableId, venueDbId]); }
        recordAudit(req, 'order.transferred', 'order', rows[0].id, beforeRows[0] || null, rows[0]); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_action_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderAction[1]);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (orderAction[2] === 'status') {
       if (!['open', 'in_progress', 'ready', 'closed', 'cancelled'].includes(input.status)) return json(res, 400, { error: 'invalid_order_status' });
       if (!validOrderTransition(order.status, input.status)) return json(res, 409, { error: 'invalid_order_transition', from: order.status, to: input.status });
      const before = { status: order.status, tableId: order.tableId }; order.status = input.status; if (input.status === 'closed') order.closedAt = new Date().toISOString();
      if (['closed', 'cancelled'].includes(input.status)) releaseMemoryTableIfIdle(order.tableId);
      recordAudit(req, 'order.status_changed', 'order', order.id, before, { status: order.status, tableId: order.tableId }); return json(res, 200, order);
    }
    if (typeof input.tableId !== 'string' || !input.tableId.trim() || input.tableId.length > 80) return json(res, 400, { error: 'table_id_required' });
    if (orders.some((entry) => entry.id !== order.id && entry.tableId === input.tableId.trim() && ['open', 'in_progress', 'ready'].includes(entry.status))) return json(res, 409, { error: 'target_table_has_active_order' });
    const before = { tableId: order.tableId }; const previousTable = order.tableId; order.tableId = input.tableId.trim(); setMemoryTableStatus(order.tableId, 'occupied'); releaseMemoryTableIfIdle(previousTable); recordAudit(req, 'order.transferred', 'order', order.id, before, { tableId: order.tableId }); return json(res, 200, order);
  }
  const itemMatch = pathname.match(/^\/api\/orders\/([^/]+)\/items$/);
  if (itemMatch && req.method === 'POST') {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(itemMatch[1])) {
      const { rows: orderStateRows } = await repositories.pool.query('SELECT status FROM orders WHERE id=$1 AND venue_id=$2', [itemMatch[1], venueDbId]);
      if (!orderStateRows[0]) return json(res, 404, { error: 'order_not_found' });
      if (!['open', 'in_progress', 'ready'].includes(orderStateRows[0].status)) return json(res, 409, { error: 'order_not_editable' });
      const input = await body(req); const quantity = Number(input.quantity || 1); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return json(res, 400, { error: 'quantity_must_be_positive' });
      try { const { rows: productRows } = await repositories.pool.query('SELECT id,name,sale_price AS "unitPrice",category AS station FROM products WHERE id=$1 AND venue_id=$2 AND is_active=true', [input.productId, venueDbId]); const product = productRows[0]; if (!product) return json(res, 400, { error: 'product_not_found' }); const { rows: existingRows } = await repositories.pool.query('SELECT id,product_id AS "productId",quantity,unit_price AS "unitPrice",station FROM order_items WHERE order_id=$1 AND product_id=$2 AND unit_price=$3 ORDER BY id LIMIT 1', [itemMatch[1], product.id, product.unitPrice]); if (existingRows[0]) { const nextQuantity = Number(existingRows[0].quantity) + quantity; if (nextQuantity > 999) return json(res, 400, { error: 'quantity_must_be_positive' }); const { rows } = await repositories.pool.query('UPDATE order_items SET quantity=$1 WHERE id=$2 RETURNING id,product_id AS "productId",quantity,unit_price AS "unitPrice",station', [nextQuantity, existingRows[0].id]); const result = { ...rows[0], name: product.name }; recordAudit(req, 'order.item_quantity_increased', 'order_item', rows[0].id, existingRows[0], result); return json(res, 200, result); } const { rows } = await repositories.pool.query('INSERT INTO order_items (order_id,product_id,quantity,unit_price,station) VALUES ($1,$2,$3,$4,$5) RETURNING id,product_id AS "productId",quantity,unit_price AS "unitPrice",station', [itemMatch[1], product.id, quantity, product.unitPrice, product.station]); const result = { ...rows[0], name: product.name }; recordAudit(req, 'order.item_added', 'order_item', rows[0].id, null, result); return json(res, 201, result); } catch (error) { return json(res, 409, { error: 'order_item_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === itemMatch[1]);
    if (order && !['open', 'in_progress', 'ready'].includes(order.status)) return json(res, 409, { error: 'order_not_editable' });
    const input = await body(req); const quantity = Number(input.quantity || 1);
    const product = products.find((entry) => entry.id === input.productId);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (!product) return json(res, 400, { error: 'product_not_found' });
    if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' });
    const existing = order.items.find((entry) => entry.productId === product.id && Number(entry.unitPrice) === Number(product.price));
    if (existing) { const nextQuantity = Number(existing.quantity || 0) + quantity; if (nextQuantity > 999) return json(res, 400, { error: 'quantity_must_be_positive' }); const before = { ...existing }; existing.quantity = nextQuantity; recordAudit(req, 'order.item_quantity_increased', 'order_item', existing.id, before, existing); return json(res, 200, existing); }
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
        const { rows: orderStateRows } = await repositories.pool.query('SELECT status FROM orders WHERE id=$1 AND venue_id=$2', [itemAction[1], venueDbId]);
        if (!orderStateRows[0]) return json(res, 404, { error: 'order_not_found' });
        if (!['open', 'in_progress', 'ready'].includes(orderStateRows[0].status)) return json(res, 409, { error: 'order_not_editable' });
        if (req.method === 'DELETE') { const { rows } = await repositories.pool.query('DELETE FROM order_items WHERE id=$1 AND order_id=$2 RETURNING id,quantity,unit_price AS "unitPrice"', [itemAction[2], itemAction[1]]); if (!rows[0]) return json(res, 404, { error: 'order_item_not_found' }); recordAudit(req, 'order.item_removed', 'order_item', rows[0].id, rows[0], null); return json(res, 200, rows[0]); }
        const input = await body(req); const quantity = Number(input.quantity); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' }); const { rows } = await repositories.pool.query('UPDATE order_items SET quantity=$1 WHERE id=$2 AND order_id=$3 RETURNING id,quantity,unit_price AS "unitPrice"', [quantity, itemAction[2], itemAction[1]]); if (!rows[0]) return json(res, 404, { error: 'order_item_not_found' }); recordAudit(req, 'order.item_quantity_changed', 'order_item', rows[0].id, null, rows[0]); return json(res, 200, rows[0]);
      } catch (error) { return json(res, 409, { error: 'order_item_update_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === itemAction[1]); if (order && !['open', 'in_progress', 'ready'].includes(order.status)) return json(res, 409, { error: 'order_not_editable' }); const item = order?.items?.find((entry) => entry.id === itemAction[2]); if (!item) return json(res, 404, { error: 'order_item_not_found' });
    if (req.method === 'DELETE') { order.items = order.items.filter((entry) => entry.id !== item.id); recordAudit(req, 'order.item_removed', 'order_item', item.id, item, null); return json(res, 200, { id: item.id }); }
    const input = await body(req); const quantity = Number(input.quantity); if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'quantity_must_be_positive' }); const beforeQuantity = item.quantity; item.quantity = quantity; recordAudit(req, 'order.item_quantity_changed', 'order_item', item.id, { quantity: beforeQuantity }, item); return json(res, 200, item);
  }
  const paymentPath = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);
  if (paymentPath && (req.method === 'GET' || req.method === 'POST')) {
    if (denyUnless(req, res, 'orders')) return;
    if (repositories?.pool && /^[0-9a-f-]{36}$/i.test(paymentPath[1])) {
      try {
        const { rows: orderRows } = await repositories.pool.query('SELECT id,status,table_id AS "tableId",vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [paymentPath[1], venueDbId]);
        const persisted = orderRows[0]; if (!persisted) return json(res, 404, { error: 'order_not_found' }); if (req.method === 'POST' && (persisted.status === 'closed' || persisted.status === 'cancelled')) return json(res, 409, { error: 'order_already_final' });
        const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [paymentPath[1]]);
        const subtotal = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); const { rows: discountRows } = await repositories.pool.query('SELECT type,value FROM discounts WHERE order_id=$1 AND status=\'approved\'', [paymentPath[1]]); const discount = discountRows.reduce((sum, item) => sum + (item.type === 'percent' ? subtotal * Math.min(100, Math.max(0, Number(item.value || 0))) / 100 : Math.max(0, Number(item.value || 0))), 0); const due = Math.max(subtotal - discount, Number(persisted.minimumOrderTotal || 0));
        if (req.method === 'GET') { const { rows } = await repositories.pool.query('SELECT id,method,amount,status,created_at AS "createdAt" FROM payments WHERE order_id=$1 ORDER BY created_at', [paymentPath[1]]); return json(res, 200, { items: rows, due, paid: rows.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0), remaining: Math.max(0, due - rows.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0)) }); }
        const input = await body(req); const amount = Number(input.amount); const method = String(input.method || 'cash'); if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'card', 'qr'].includes(method)) return json(res, 400, { error: 'valid_method_and_amount_required' });
        const { rows: paidRows } = await repositories.pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND status=\'paid\'', [paymentPath[1]]); const paid = Number(paidRows[0]?.paid || 0); if (paid + amount > due + 0.01) return json(res, 409, { error: 'payment_exceeds_due', remaining: Math.max(0, due - paid) });
        const { rows } = await repositories.pool.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,\'paid\') RETURNING id,method,amount,status,created_at AS "createdAt"', [paymentPath[1], method, amount]); const nextPaid = paid + amount; if (nextPaid >= due) { await repositories.pool.query('UPDATE orders SET status=\'closed\',closed_at=now() WHERE id=$1 AND venue_id=$2', [paymentPath[1], venueDbId]); if (persisted.tableId) await repositories.pool.query(`UPDATE tables SET status=CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=$1 AND r.venue_id=$2 AND r.status=\'confirmed\' AND r.starts_at::date=CURRENT_DATE) THEN \'reserved\' ELSE \'free\' END WHERE id=$1 AND venue_id=$2 AND status <> \'blocked\' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_id=$1 AND o.venue_id=$2 AND o.status IN (\'open\',\'in_progress\',\'ready\'))`, [persisted.tableId, venueDbId]); } const closed = nextPaid >= due; const finalMeta = closed ? { finalTotal: due, discountTotal: discount, minimumAdjustment: Math.max(0, Number(persisted.minimumOrderTotal || 0) - (subtotal - discount)), paymentMethod: paid > 0 ? 'mixed' : method } : {}; recordAudit(req, 'order.payment_added', 'payment', rows[0].id, null, { ...rows[0], orderId: paymentPath[1], paid: nextPaid, due, closed }); return json(res, 201, { ...rows[0], due, paid: nextPaid, remaining: Math.max(0, due - nextPaid), closed, ...finalMeta });
      } catch (error) { return json(res, 409, { error: 'payment_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === paymentPath[1]); if (!order) return json(res, 404, { error: 'order_not_found' }); if (req.method === 'POST' && (order.status === 'closed' || order.status === 'cancelled')) return json(res, 409, { error: 'order_already_final' }); order.payments ||= []; const subtotal = orderTotal(order); const discount = approvedDiscountTotal(order.id, subtotal); const due = Math.max(subtotal - discount, Number(order.minimumOrderTotal || 0)); const paid = order.payments.reduce((sum, item) => sum + Number(item.amount), 0);
    if (req.method === 'GET') return json(res, 200, { items: order.payments, due, paid, remaining: Math.max(0, due - paid) });
    const input = await body(req); const amount = Number(input.amount); const method = String(input.method || 'cash'); if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'card', 'qr'].includes(method)) return json(res, 400, { error: 'valid_method_and_amount_required' }); if (paid + amount > due + 0.01) return json(res, 409, { error: 'payment_exceeds_due', remaining: Math.max(0, due - paid) }); const payment = { id: `pay-${Date.now()}`, method, amount, status: 'paid', createdAt: new Date().toISOString() }; order.payments.push(payment); const nextPaid = paid + amount; const closed = nextPaid >= due; if (closed) { order.status = 'closed'; order.closedAt = payment.createdAt; order.subtotal = subtotal; order.discountTotal = discount; order.finalTotal = due; order.minimumAdjustment = Math.max(0, Number(order.minimumOrderTotal || 0) - (subtotal - discount)); order.paymentMethod = order.payments.length === 1 ? method : 'mixed'; order.paid = nextPaid; order.remaining = 0; releaseMemoryTableIfIdle(order.tableId); } recordAudit(req, 'order.payment_added', 'payment', payment.id, null, { ...payment, orderId: order.id, paid: nextPaid, due, closed }); return json(res, 201, { ...payment, due, paid: nextPaid, remaining: Math.max(0, due - nextPaid), closed, ...(closed ? { finalTotal: order.finalTotal, discountTotal: order.discountTotal, minimumAdjustment: order.minimumAdjustment, paymentMethod: order.paymentMethod } : {}) });
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
      try { const { rows: orderRows } = await repositories.pool.query('SELECT id,status,table_id AS "tableId",vip_minimum AS "minimumOrderTotal" FROM orders WHERE id=$1 AND venue_id=$2', [orderPath[1], venueDbId]); const persisted = orderRows[0]; if (!persisted) return json(res, 404, { error: 'order_not_found' }); if (['closed', 'cancelled'].includes(persisted.status)) return json(res, 409, { error: 'order_already_final' }); const { rows: itemRows } = await repositories.pool.query('SELECT quantity,unit_price AS "unitPrice" FROM order_items WHERE order_id=$1', [orderPath[1]]); const subtotal = itemRows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); const { rows: discountRows } = await repositories.pool.query('SELECT type,value FROM discounts WHERE order_id=$1 AND status=\'approved\'', [orderPath[1]]); const discount = discountRows.reduce((sum, item) => sum + (item.type === 'percent' ? subtotal * Math.min(100, Math.max(0, Number(item.value || 0))) / 100 : Math.max(0, Number(item.value || 0))), 0); const minimum = Number(persisted.minimumOrderTotal || 0); const finalTotal = Math.max(subtotal - discount, minimum); const { rows: paidRows } = await repositories.pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND status=\'paid\'', [orderPath[1]]); const paid = Number(paidRows[0]?.paid || 0); const remaining = Math.max(0, finalTotal - paid); const { rows } = await repositories.pool.query('UPDATE orders SET status=$1,closed_at=now() WHERE id=$2 AND venue_id=$3 AND status NOT IN (\'closed\',\'cancelled\') RETURNING *', ['closed', orderPath[1], venueDbId]); if (!rows[0]) return json(res, 409, { error: 'order_already_final' }); if (remaining > 0) await repositories.pool.query('INSERT INTO payments (order_id,method,amount,status) VALUES ($1,$2,$3,$4)', [orderPath[1], paymentMethod, remaining, 'paid']); if (persisted.tableId) await repositories.pool.query(`UPDATE tables SET status=CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=$1 AND r.venue_id=$2 AND r.status=\'confirmed\' AND r.starts_at::date=CURRENT_DATE) THEN \'reserved\' ELSE \'free\' END WHERE id=$1 AND venue_id=$2 AND status <> \'blocked\' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_id=$1 AND o.venue_id=$2 AND o.status IN (\'open\',\'in_progress\',\'ready\'))`, [persisted.tableId, venueDbId]); const result = { ...rows[0], subtotal, discountTotal: discount, finalTotal, paid: paid + remaining, remaining: 0, minimumAdjustment: Math.max(0, minimum - (subtotal - discount)), paymentMethod }; recordAudit(req, 'order.closed', 'order', orderPath[1], { status: persisted.status }, result); return json(res, 200, result); } catch (error) { return json(res, 409, { error: 'order_close_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]);
    if (!order) return json(res, 404, { error: 'order_not_found' });
    if (['closed', 'cancelled'].includes(order.status)) return json(res, 409, { error: 'order_already_final' });
    const input = await body(req); const paymentMethod = String(input.paymentMethod || 'cash'); if (!['cash', 'card', 'qr'].includes(paymentMethod)) return json(res, 400, { error: 'valid_payment_method_required' });
    const total = orderTotal(order); const discount = approvedDiscountTotal(order.id, total); const minimum = Number(order.minimumOrderTotal || 0);
    order.status = 'closed'; order.closedAt = new Date().toISOString(); releaseMemoryTableIfIdle(order.tableId); order.subtotal = total; order.discountTotal = discount; order.finalTotal = Math.max(total - discount, minimum); order.payments ||= []; const alreadyPaid = order.payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0); const remaining = Math.max(0, order.finalTotal - alreadyPaid); if (remaining > 0) order.payments.push({ id: `pay-${Date.now()}`, method: paymentMethod, amount: remaining, status: 'paid', createdAt: order.closedAt }); order.paid = alreadyPaid + remaining; order.remaining = 0; order.minimumAdjustment = Math.max(0, minimum - (total - discount)); order.paymentMethod = paymentMethod;
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
      const input = await body(req); const type = String(input.type || 'percent'); const value = Number(input.value); const reason = String(input.reason || '').trim(); if (!reason || !Number.isFinite(value) || value <= 0 || type !== 'percent' || value > 100 || reason.length > 500) return json(res, 400, { error: 'invalid_discount_request' });
      try { const { rows: stateRows } = await repositories.pool.query('SELECT status FROM orders WHERE id=$1 AND venue_id=$2', [orderPath[1], venueDbId]); if (!stateRows[0]) return json(res, 404, { error: 'order_not_found' }); if (['closed', 'cancelled'].includes(stateRows[0].status)) return json(res, 409, { error: 'order_already_final' }); const { rows: duplicateRows } = await repositories.pool.query('SELECT id FROM discounts WHERE order_id=$1 AND status=\'requested\' LIMIT 1', [orderPath[1]]); if (duplicateRows[0]) return json(res, 409, { error: 'discount_request_pending' }); const requestedBy = /^[0-9a-f-]{36}$/i.test(req.user?.id || '') ? req.user.id : '20000000-0000-0000-0000-000000000001'; const { rows } = await repositories.pool.query('INSERT INTO discounts (order_id,requested_by,type,value,reason,status,approved_by,decided_at) SELECT id,$2,$3,$4,$5,\'requested\',NULL,NULL FROM orders WHERE id=$1 AND venue_id=$6 RETURNING id,order_id AS "orderId",type,value,reason,status,requested_by AS "requestedBy",approved_by AS "approvedBy",created_at AS "createdAt",decided_at AS "decidedAt"', [orderPath[1], requestedBy, type, value, reason, venueDbId]); if (!rows[0]) return json(res, 404, { error: 'order_not_found' }); recordAudit(req, 'discount.applied_by_staff', 'discount', rows[0].id, null, { ...rows[0], notificationRecipients: ['owner', 'admin'] }); return json(res, 201, { ...rows[0], notificationRecipients: ['owner', 'admin'] }); } catch (error) { return json(res, 409, { error: 'discount_create_failed', detail: error.message }); }
    }
    const order = orders.find((entry) => entry.id === orderPath[1]); const input = await body(req);
    if (!order) return json(res, 404, { error: 'order_not_found' }); if (['closed', 'cancelled'].includes(order.status)) return json(res, 409, { error: 'order_already_final' });
    const type = String(input.type || 'percent'); const value = Number(input.value); const reason = String(input.reason || '').trim(); if (!reason || !Number.isFinite(value) || value <= 0 || type !== 'percent' || value > 100 || reason.length > 500) return json(res, 400, { error: 'invalid_discount_request' }); if (discountRequests.some((entry) => entry.orderId === order.id && entry.status === 'requested')) return json(res, 409, { error: 'discount_request_pending' });
    const request = { id: `disc-${Date.now()}`, orderId: order.id, type, value, reason, guestName: order.guestName || null, guestPhone: order.guestPhone || null, status: 'requested', requestedBy: input.requestedBy || req.user?.name || 'unknown', createdAt: new Date().toISOString(), notificationRecipients: ['owner', 'admin'] };
    discountRequests.push(request); recordAudit(req, 'discount.applied_by_staff', 'discount', request.id, null, request); return json(res, 201, request);
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
      try { const { rows } = await repositories.pool.query(`UPDATE discounts SET status=$1,approved_by=$2,decided_at=now() WHERE id=$3 AND status=$4 AND EXISTS (SELECT 1 FROM orders o WHERE o.id=discounts.order_id AND o.venue_id=$5 AND o.status NOT IN ('closed','cancelled')) RETURNING id,order_id AS "orderId",type,value,reason,status,requested_by AS "requestedBy",approved_by AS "approvedBy",created_at AS "createdAt",decided_at AS "decidedAt"`, [status, decidedBy, decision[1], 'requested', venueDbId]); if (!rows[0]) return json(res, 409, { error: 'discount_not_found_or_decided' }); recordAudit(req, `discount.${status}`, 'discount', rows[0].id, { status: 'requested' }, rows[0]); return json(res, 200, rows[0]); } catch (error) { return json(res, 409, { error: 'discount_decision_failed', detail: error.message }); }
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
  const aliases = { '/': '/index.html', '/admin': '/admin.html', '/login': '/login.html', '/inventory': '/inventory.html', '/finance': '/finance.html', '/finance/categories': '/finance-categories.html', '/finance/report': '/finance-report.html', '/reservations': '/reservations.html', '/clients': '/clients.html', '/orders': '/orders.html', '/integrations': '/integrations.html', '/network': '/network.html', '/delivery': '/delivery.html', '/platform': '/platform.html' };
  requestPath = aliases[routePath] || requestPath;
  // Only browser runtime files are public. Never expose the project directory.
  const publicFiles = new Set([
    ...Object.values(aliases), '/style.css', '/app.js', '/portal.js', '/admin.js',
    '/login.js', '/platform.js', '/catalog-seed.js', '/staff-profile.js', '/staff-audit.js',
    '/staff-phone-fields.js', '/staff-sensitive-fields.js', '/staff-admin-card.js',
    '/staff-telegram-link.js', '/vip-deposit.js', '/vip-deposit-ui.js',
    '/assets/tabler-icons.svg', '/assets/login-hookah-reference.jpg',
    ...[400, 500, 600, 700, 800].map(weight => `/assets/fonts/manrope-${weight}.ttf`)
  ]);
  if (!publicFiles.has(requestPath)) { res.writeHead(404); return res.end('Not found'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  const file = path.resolve(root, `.${requestPath}`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) { const result = await api(req, res); if (result !== null) return result; }
    return staticFile(req, res);
  } catch (error) { return json(res, 500, { error: 'internal_error', message: error.message }); }
});
server.listen(process.env.PORT || 3000, process.env.HOST || undefined, () => console.log(`CRM running on http://localhost:${server.address().port}`));

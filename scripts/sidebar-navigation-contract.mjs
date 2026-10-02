import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const requiredLabels = [
  'Рабочий зал', 'Заказы', 'Гости', 'Бронирования', 'Доставка',
  'Каталог товаров', 'Технологические карты', 'Остатки', 'Пополнение запасов',
  'Поставки и списания', 'Заготовки и премиксы', 'Цеха и категории',
  'Обзор финансов', 'Отчёты', 'Категории доходов и расходов', 'Персонал',
  'Роли и права доступа', 'Задачи', 'Настройки заведения', 'Настройки модулей',
  'Безопасность', 'Журнал действий', 'Уведомления', 'Интеграции', 'Моя сеть',
  'Диагностика', 'Помощь',
];
for (const label of requiredLabels) assert.ok(portal.includes(`label: '${label}'`), `sidebar label missing: ${label}`);
for (const href of ['/','/orders','/clients','/reservations','/delivery','/inventory?view=products','/inventory?view=recipes','/inventory?view=stock','/inventory?view=auto-orders','/inventory?view=movements','/inventory?view=premixes','/inventory?view=directories','/finance','/finance/report','/finance/categories','/admin#staff','/admin#permissions','/admin#tasks','/admin#company','/admin#settings-dashboard-modules','/admin#lock-security','/admin#audit','/admin#notifications','/integrations','/network','/admin#diagnostics','/admin#help']) {
  assert.ok(portal.includes(`href: '${href}'`), `sidebar route missing: ${href}`);
}
assert.ok(portal.includes('const refreshSidebarCounters = () =>'), 'sidebar counters exist');
for (const source of ['/api/metrics', '/api/notifications?limit=1&filter=unread', '/api/shifts', '/api/integrations']) assert.ok(portal.includes(`api('${source}')`), `sidebar indicator source missing: ${source}`);
assert.match(portal, /localStorage\.setItem\(groupStorageKey\(key\)/, 'group state is stored per user');
assert.match(portal, /summary\.setAttribute\('aria-expanded'/, 'groups expose aria-expanded');
assert.match(portal, /link\.setAttribute\('aria-current', 'page'\)/, 'active links expose aria-current');
assert.match(portal, /sidebar-menu-search/, 'menu search exists');
console.log(`SIDEBAR NAVIGATION CONTRACT: PASS (${requiredLabels.length} labels, ${26} routes, attention indicators and accessibility hooks)`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const portal = readFileSync(new URL('portal.js', root), 'utf8');
const styles = readFileSync(new URL('style.css', root), 'utf8');
const rules = readFileSync(new URL('VISUAL_PAGE_RULES.md', root), 'utf8');
const dashboardStart = portal.indexOf('function renderDashboard()');
const dashboard = portal.slice(dashboardStart, portal.indexOf('function renderInventory()', dashboardStart));

for (const label of ['Выручка сегодня', 'К оплате', 'Открытые заказы', 'Бронирования сегодня', 'Нужно пополнить']) {
  assert.ok(dashboard.includes(label), `dashboard KPI label missing: ${label}`);
}
assert.match(dashboard, /id="dash-pending-revenue"[\s\S]*?id="dash-pending-detail"/,
  'pending balance and explanation must remain distinct from received revenue');
assert.doesNotMatch(dashboard, /dashboard-revenue-spark/,
  'dashboard must not show a decorative trend without real time-series data');
assert.doesNotMatch(dashboard, /data-dashboard-revenue-style/,
  'headline KPIs must use one consistent design');
assert.doesNotMatch(dashboard, /insight-stat-grid|Брони сегодня|Ожидают оплаты/,
  'the lower dashboard section must not repeat headline metrics');
assert.ok(dashboard.includes('Оплаты за сегодня · аналитика за последние 7 дней'),
  'secondary dashboard details must state their periods');
assert.ok(portal.includes('Оплат пока нет'), 'payment details need a calm empty state');
assert.ok(portal.includes('has-pending'), 'pending payments should only use alert color when a balance exists');
assert.match(styles, /\.dashboard-kpi-grid\{[^}]*container-type:inline-size/);
assert.match(styles, /dashboard-revenue-card \.dashboard-revenue-main>strong\{[^}]*font-size:clamp\(34px,2\.8vw,42px\)/,
  'received revenue must remain the dominant value');
assert.match(styles, /\.dashboard-kpi-grid\{grid-template-columns:minmax\(0,1fr\);/,
  'mobile KPI layout must use one column');
assert.match(rules, /Не использовать декоративные графики без реальных рядов данных/);
console.log('DASHBOARD KPI DESIGN CONTRACT: PASS (meaning, hierarchy, consistent styling, and responsive layout)');

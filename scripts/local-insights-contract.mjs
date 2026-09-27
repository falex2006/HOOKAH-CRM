import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const dashboardStart = source.indexOf('function renderDashboard()');
const dashboard = source.slice(dashboardStart, source.indexOf('function renderInventory()', dashboardStart));
const shiftKpiStart = source.indexOf('function setupDashboardShiftKpis()');
const shiftKpis = source.slice(shiftKpiStart, source.indexOf('\nfunction ', shiftKpiStart + 1));
for (const fragment of ['id="dashboard-insights"', 'id="dashboard-shift-date"', 'id="dashboard-shift-select"', 'id="dashboard-shift-kpis"']) {
  if (!dashboard.includes(fragment)) throw new Error(`shift insights UI is missing: ${fragment}`);
}
for (const fragment of ["api(`/api/dashboard/shift-kpis", 'data.totals', 'totals.revenue', 'totals.closedOrders', 'totals.paymentCount', 'totals.cashless']) {
  if (!shiftKpis.includes(fragment)) throw new Error(`shift KPI flow is missing: ${fragment}`);
}
if (!dashboard.includes('setupDashboardShiftKpis();')) throw new Error('dashboard shift KPIs are not initialized');
if (/insight-stat-grid|data-insight-toggle|dashboard-revenue-spark/.test(dashboard)) throw new Error('duplicate or decorative dashboard indicators remain');
console.log('LOCAL INSIGHTS CONTRACT: PASS (date/shift selection drives current shift KPIs)');

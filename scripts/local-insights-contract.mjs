import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const dashboardStart = source.indexOf('function renderDashboard()');
const dashboard = source.slice(dashboardStart, source.indexOf('function renderInventory()', dashboardStart));
for (const fragment of ['dashboard-insight-payments', 'dashboard-insight-extra']) {
  if (!dashboard.includes(fragment)) throw new Error(`dashboard details missing: ${fragment}`);
}
for (const fragment of ['analytics.netProfit', 'analytics.averageCheck', 'analytics.hallLoad']) {
  if (!source.includes(fragment)) throw new Error(`dashboard analytics missing: ${fragment}`);
}
if (/insight-stat-grid|data-insight-toggle|dashboard-revenue-spark/.test(dashboard)) throw new Error('duplicate or decorative dashboard indicators remain');
console.log('LOCAL INSIGHTS CONTRACT: PASS (secondary details stay useful without repeating headline KPIs)');

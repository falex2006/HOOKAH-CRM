import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const chartStart = portal.indexOf('const drawFinanceChart = (analytics) => {');
const chartEnd = portal.indexOf('\n  };', chartStart);
assert.ok(chartStart >= 0 && chartEnd > chartStart, 'finance chart renderer exists');
const chart = portal.slice(chartStart, chartEnd);

assert.match(chart, /if \(metric === 'orders' \|\| metric === 'average' \|\| metric === 'average_median'\) return orders > 0/,
  'orders and average-check series require actual order activity');
assert.match(chart, /if \(metric === 'expenses'\) return expenses > 0/,
  'expense series requires actual expense activity');
assert.match(chart, /if \(metric === 'profit'\) return orders > 0 \|\| revenue > 0 \|\| expenses > 0 \|\| costOfGoods > 0/,
  'profit series distinguishes a real zero result from no source activity');
assert.ok(chart.includes('chart.innerHTML = days.length && hasMetricData ?') && chart.includes('class="finance-chart-summary"'),
  'summary and plot are omitted when no activity exists for the selected metric');
assert.match(chart, /class="finance-chart-empty" role="status" aria-live="polite"/,
  'empty period uses an accessible explanatory state instead of a flat zero chart');
assert.match(styles, /\.finance-chart-empty\{[^}]*min-height:210px/,
  'the no-data state has intentional layout and visual hierarchy');
assert.match(styles, /\.finance-kpi-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  'the three finance KPIs fill the available desktop row');

console.log('FINANCE CHART EMPTY STATE CONTRACT: PASS (zero activity is explicit; desktop KPI row matches its three-card content)');

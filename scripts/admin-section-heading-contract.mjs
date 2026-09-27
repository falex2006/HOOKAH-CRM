import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminHtml = fs.readFileSync('admin.html', 'utf8');
const portal = fs.readFileSync('portal.js', 'utf8');
const titleMap = portal.match(/const adminSectionTitles = \{([^}]+)\}/)?.[1] || '';
const greeting = portal.match(/function updateDashboardGreeting\(\) \{([^}]+)\}/)?.[1] || '';
const staffBranchStart = portal.indexOf("} else if (dashboardFocus === 'staff') {");
const staffBranchEnd = portal.indexOf("} else if (dashboardFocus === 'company') {", staffBranchStart);
const staffBranch = portal.slice(staffBranchStart, staffBranchEnd);

assert.match(adminHtml, /<b data-admin-section-title>Главная<\/b>/,
  'admin top bar exposes a dynamic subsection title');
assert.match(titleMap, /'#staff':\s*'Сотрудники'/,
  'staff subsection maps to the same label as its page heading');
assert.match(portal, /window\.addEventListener\('hashchange', updateAdminSectionTitle\)/,
  'admin top bar title updates when the selected subsection changes');
assert.match(greeting, /window\.location\.hash && window\.location\.hash !== '#'/,
  'async dashboard greeting does not overwrite a subsection heading');
assert.match(staffBranch, /staffTitle\.textContent = 'Сотрудники'/,
  'staff subsection page heading remains explicit');
assert.ok(staffBranch.includes(`setDashboardPanelVisibility('[data-dashboard-module="kpi"]`),
  'staff subsection hides both the KPI cards and their separate heading');
assert.match(portal, /dashboard-live-heading" data-dashboard-module="kpi"/,
  'the live KPI heading remains grouped with the dashboard KPI module');

console.log('ADMIN SECTION HEADING CONTRACT: PASS (staff title stays aligned and dashboard KPI heading is hidden in subsections)');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminHtml = fs.readFileSync('admin.html', 'utf8');
const portal = fs.readFileSync('portal.js', 'utf8');
const style = fs.readFileSync('style.css', 'utf8');
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
assert.match(portal, /getSettingsHashTarget\s*=\s*\(hash = window\.location\.hash\) =>/,
  'settings hash routes resolve to their actual visible panel instead of a generic page heading');
assert.ok(portal.indexOf('const getSettingsHashTarget =') < portal.indexOf("const settingsHash = ['#settings'"),
  'the settings hash target helper lives in the renderDashboard scope so both initial and subsequent route changes can call it');
assert.match(portal, /const focusedSettingsHash = \['#company', '#settings-dashboard-modules', '#venue-layout-settings', '#lock-security', '#audit'\]/,
  'direct settings child links scroll to the selected subsection');
assert.match(portal, /const focused = \['#company', '#settings-dashboard-modules', '#venue-layout-settings', '#lock-security', '#audit'\]/,
  'in-app settings child navigation scrolls to the selected subsection');
assert.match(portal, /if \(target\._dashboardHashChangeHandler\) window\.removeEventListener\('hashchange', target\._dashboardHashChangeHandler\);\s*target\._dashboardHashChangeHandler = dashboardHashChangeHandler;\s*window\.addEventListener\('hashchange', dashboardHashChangeHandler\);/,
  'rerendering the dashboard replaces its hash handler instead of accumulating listeners');
assert.match(style, /\.velora-theme \.page-title\{scroll-margin-top:calc\(var\(--crm-header-height,68px\) \+ 12px\)\}/,
  'hash navigation keeps the complete eyebrow and heading clear of the fixed management header');
assert.match(style, /\.velora-theme #company-form,.velora-theme #settings-dashboard-modules/,
  'settings subsections also clear the fixed management header when scrolled into view');
const settingsHub = portal.match(/settingsHub\.innerHTML = `([^`]+)`/)?.[1] || '';
assert.ok(settingsHub, 'settings hub markup exists');
assert.doesNotMatch(settingsHub, /<h2>Настройки CRM<\/h2>/,
  'the settings overview does not repeat the page H1 inside its panel');

console.log('ADMIN SECTION HEADING CONTRACT: PASS (staff title stays aligned and dashboard KPI heading is hidden in subsections)');

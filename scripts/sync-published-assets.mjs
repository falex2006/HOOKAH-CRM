import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cssRevision = '321';
const portalRevision = '315';
const lockRevision = '14';
const appRevision = '134';
const staffProfileRevision = '6';
const loginRevision = '92';
const staffAdminCardRevision = '4';
const purchaseDocumentValidationRevision = '1';
// Keep flat pages and directory-index aliases in dist aligned with their source
// templates. Static hosts commonly resolve /login/ to dist/login/index.html,
// so every public route alias must receive the same safe initial markup.
for (const name of readdirSync(root).filter((entry) => entry.endsWith('.html'))) {
  cpSync(resolve(root, name), resolve(root, 'dist', name));
}
const routeAliases = {
  'admin/index.html': 'admin.html',
  'clients/index.html': 'clients.html',
  'delivery/index.html': 'delivery.html',
  'finance/index.html': 'finance.html',
  'finance/categories/index.html': 'finance-categories.html',
  'finance/report/index.html': 'finance-report.html',
  'integrations/index.html': 'integrations.html',
  'inventory/index.html': 'inventory.html',
  'login/index.html': 'login.html',
  'network/index.html': 'network.html',
  'orders/index.html': 'orders.html',
  'platform/index.html': 'platform.html',
  'reservations/index.html': 'reservations.html',
};
for (const [alias, source] of Object.entries(routeAliases)) {
  cpSync(resolve(root, source), resolve(root, 'dist', alias));
}
const htmlFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html')) htmlFiles.push(path);
  }
};

for (const entry of readdirSync(root, { withFileTypes: true })) {
  const path = resolve(root, entry.name);
  if (entry.isDirectory() && entry.name === 'dist') walk(path);
  else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(path);
}

for (const path of htmlFiles) {
  const html = readFileSync(path, 'utf8')
    .replace(/style\.css\?rev=\d+/g, `style.css?rev=${cssRevision}`)
    .replace(/portal\.js\?rev=\d+/g, `portal.js?rev=${portalRevision}`)
    .replace(/lock\.js\?rev=\d+/g, `lock.js?rev=${lockRevision}`)
    .replace(/app\.js\?rev=\d+/g, `app.js?rev=${appRevision}`)
    .replace(/staff-profile\.js\?rev=\d+/g, `staff-profile.js?rev=${staffProfileRevision}`)
    .replace(/login\.js\?rev=\d+/g, `login.js?rev=${loginRevision}`)
    .replace(/staff-admin-card\.js\?rev=\d+/g, `staff-admin-card.js?rev=${staffAdminCardRevision}`);
  const versionedHtml = html.replace(/purchase-document-validation\.js\?rev=\d+/g, `purchase-document-validation.js?rev=${purchaseDocumentValidationRevision}`);
  writeFileSync(path, versionedHtml);
}
cpSync(resolve(root, 'portal.js'), resolve(root, 'dist', 'portal.js'));
cpSync(resolve(root, 'lock.js'), resolve(root, 'dist', 'lock.js'));
cpSync(resolve(root, 'app.js'), resolve(root, 'dist', 'app.js'));
cpSync(resolve(root, 'staff-profile.js'), resolve(root, 'dist', 'staff-profile.js'));
cpSync(resolve(root, 'login.js'), resolve(root, 'dist', 'login.js'));
cpSync(resolve(root, 'style.css'), resolve(root, 'dist', 'style.css'));
cpSync(resolve(root, 'staff-admin-card.js'), resolve(root, 'dist', 'staff-admin-card.js'));
cpSync(resolve(root, 'purchase-document-validation.js'), resolve(root, 'dist', 'purchase-document-validation.js'));
cpSync(resolve(root, 'assets', 'tabler-icons.svg'), resolve(root, 'dist', 'assets', 'tabler-icons.svg'));
console.log(`Synced app.js rev=${appRevision}, portal.js rev=${portalRevision}, lock.js rev=${lockRevision}, staff-profile.js rev=${staffProfileRevision}, login.js rev=${loginRevision}, staff-admin-card.js rev=${staffAdminCardRevision}, style.css rev=${cssRevision} across ${htmlFiles.length} source and dist routes.`);

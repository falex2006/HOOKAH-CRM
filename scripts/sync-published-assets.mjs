import { cpSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishedHtmlFiles, routeAliases, publishedHtmlPaths, localPreviewHtmlFiles } from './published-html-manifest.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cssRevision = '366';
const portalRevision = '415';
const lockRevision = '20';
const appRevision = '174';
const staffProfileRevision = '6';
const loginRevision = '96';
const authSmokeRevision = '3';
const authSmokeCssRevision = '1';
const staffAdminCardRevision = '7';
const purchaseDocumentValidationRevision = '1';
// Keep flat pages and directory-index aliases in dist aligned with their source
// templates. Static hosts commonly resolve /login/ to dist/login/index.html,
// so every public route alias must receive the same safe initial markup.
for (const name of readdirSync(root).filter(entry => entry.endsWith('.html'))) {
  if (!publishedHtmlFiles.includes(name) && !localPreviewHtmlFiles.includes(name)) throw new Error(`Undeclared HTML template: ${name}`);
}
for (const name of publishedHtmlFiles) {
  cpSync(resolve(root, name), resolve(root, 'dist', name));
}
for (const [alias, source] of Object.entries(routeAliases)) {
  mkdirSync(resolve(root, 'dist', alias, '..'), { recursive: true });
  cpSync(resolve(root, source), resolve(root, 'dist', alias));
}
const htmlFiles = [
  ...publishedHtmlFiles.map(name => resolve(root, name)),
  ...publishedHtmlPaths.map(name => resolve(root, 'dist', name)),
];

for (const path of htmlFiles) {
  const html = readFileSync(path, 'utf8')
    .replace(/style\.css\?rev=\d+/g, `style.css?rev=${cssRevision}`)
    .replace(/portal\.js\?rev=\d+/g, `portal.js?rev=${portalRevision}`)
    .replace(/lock\.js\?rev=\d+/g, `lock.js?rev=${lockRevision}`)
    .replace(/app\.js\?rev=\d+/g, `app.js?rev=${appRevision}`)
    .replace(/staff-profile\.js\?rev=\d+/g, `staff-profile.js?rev=${staffProfileRevision}`)
    .replace(/login\.js\?rev=\d+/g, `login.js?rev=${loginRevision}`)
    .replace(/auth-smoke\.js\?rev=\d+/g, `auth-smoke.js?rev=${authSmokeRevision}`)
    .replace(/auth-smoke\.css\?rev=\d+/g, `auth-smoke.css?rev=${authSmokeCssRevision}`)
    .replace(/staff-admin-card\.js\?rev=\d+/g, `staff-admin-card.js?rev=${staffAdminCardRevision}`);
  const versionedHtml = html.replace(/purchase-document-validation\.js\?rev=\d+/g, `purchase-document-validation.js?rev=${purchaseDocumentValidationRevision}`);
  writeFileSync(path, versionedHtml);
}
cpSync(resolve(root, 'portal.js'), resolve(root, 'dist', 'portal.js'));
cpSync(resolve(root, 'lock.js'), resolve(root, 'dist', 'lock.js'));
cpSync(resolve(root, 'app.js'), resolve(root, 'dist', 'app.js'));
cpSync(resolve(root, 'staff-telegram-link.js'), resolve(root, 'dist', 'staff-telegram-link.js'));
cpSync(resolve(root, 'vip-deposit-ui.js'), resolve(root, 'dist', 'vip-deposit-ui.js'));
cpSync(resolve(root, 'staff-profile.js'), resolve(root, 'dist', 'staff-profile.js'));
cpSync(resolve(root, 'login.js'), resolve(root, 'dist', 'login.js'));
cpSync(resolve(root, 'style.css'), resolve(root, 'dist', 'style.css'));
for (const name of ['auth-smoke.js', 'auth-smoke.css']) cpSync(resolve(root, name), resolve(root, 'dist', name));
for (const name of ['login-smoke-ambient.png', 'login-smoke-ambient.mp4']) cpSync(resolve(root, 'assets', name), resolve(root, 'dist', 'assets', name));
cpSync(resolve(root, 'staff-admin-card.js'), resolve(root, 'dist', 'staff-admin-card.js'));
cpSync(resolve(root, 'purchase-document-validation.js'), resolve(root, 'dist', 'purchase-document-validation.js'));
cpSync(resolve(root, 'assets', 'tabler-icons.svg'), resolve(root, 'dist', 'assets', 'tabler-icons.svg'));
cpSync(resolve(root, 'assets', 'brand'), resolve(root, 'dist', 'assets', 'brand'), { recursive: true });
console.log(`Synced app.js rev=${appRevision}, portal.js rev=${portalRevision}, lock.js rev=${lockRevision}, staff-profile.js rev=${staffProfileRevision}, login.js rev=${loginRevision}, staff-admin-card.js rev=${staffAdminCardRevision}, style.css rev=${cssRevision} across ${htmlFiles.length} source and dist routes.`);

import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
const knownRoutes = new Set(['/','/login','/login.html','/admin','/clients','/inventory','/finance','/finance/categories','/finance/report','/reservations','/orders','/integrations','/network','/delivery']);
const failures=[]; let anchors=0, buttons=0, forms=0;
for (const file of htmlFiles) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  for (const match of source.matchAll(/<a\b([^>]*)>/gi)) {
    anchors++;
    const attrs=match[1]; const href=(attrs.match(/\bhref\s*=\s*["']([^"']*)["']/i)||[])[1];
    if (!href || href==='#' || /^javascript:/i.test(href)) failures.push(`${file}: anchor without real href`);
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      const route=href.split('#')[0].split('?')[0]||'/';
      if (!knownRoutes.has(route)) failures.push(`${file}: unknown local route ${href}`);
    }
  }
  for (const match of source.matchAll(/<button\b([^>]*)>/gi)) {
    buttons++;
    const attrs=match[1];
    if (!/\btype\s*=\s*["'](?:button|submit|reset)["']/i.test(attrs)) failures.push(`${file}: button missing explicit type: ${match[0]}`);
  }
  for (const match of source.matchAll(/<form\b([^>]*)>/gi)) {
    forms++; const attrs=match[1]; const id=(attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)||[])[1];
    if (!id) failures.push(`${file}: form missing id`);
    else {
      const scripts = fs.readdirSync(root).filter(n=>n.endsWith('.js')).map(n=>fs.readFileSync(path.join(root,n),'utf8')).join('\n');
      if (!scripts.includes(`#${id}`) && !scripts.includes(`"${id}"`) && !scripts.includes(`'${id}'`)) failures.push(`${file}: form #${id} has no client handler reference`);
    }
  }
}
for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.js') && name !== 'server.js')) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/<button\b([^>]*)>/gi)) {
    buttons++;
    if (!/\btype\s*=\s*["'](?:button|submit|reset)["']/i.test(match[1])) failures.push(`${file}: generated button missing explicit type: ${match[0]}`);
  }
}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
if (!/aside nav button/.test(app)) failures.push('index navigation has no click handler');
if (!/\.tabs button/.test(app)) failures.push('floor tabs have no click handler');
if (!/\.chips span/.test(app)) failures.push('queue filters have no click handler');
const portal=fs.readFileSync(path.join(root,'portal.js'),'utf8');
if (!/portal-nav/.test(portal)) failures.push('portal navigation runtime missing');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`LOCAL CLICK CONTRACT: PASS (anchors=${anchors}, buttons=${buttons}, forms=${forms}, routes=${knownRoutes.size})`);


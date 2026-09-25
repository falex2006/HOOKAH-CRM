import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cssRevision = '247';
const portalRevision = '260';
// Keep flat published pages in dist aligned with their source templates. Some
// deploy targets resolve /inventory.html while others use /inventory/.
for (const name of readdirSync(root).filter((entry) => entry.endsWith('.html'))) {
  cpSync(resolve(root, name), resolve(root, 'dist', name));
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
    .replace(/portal\.js\?rev=\d+/g, `portal.js?rev=${portalRevision}`);
  writeFileSync(path, html);
}
cpSync(resolve(root, 'portal.js'), resolve(root, 'dist', 'portal.js'));
cpSync(resolve(root, 'style.css'), resolve(root, 'dist', 'style.css'));
console.log(`Synced portal.js rev=${portalRevision}, style.css rev=${cssRevision} across ${htmlFiles.length} source and dist routes.`);

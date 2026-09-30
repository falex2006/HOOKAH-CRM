// Local-only preview helper for pos-demo.html; it does not modify CRM routes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const files = new Map([
  ['/pos-demo.html', ['pos-demo.html', 'text/html; charset=utf-8']],
  ['/pos-demo.css', ['pos-demo.css', 'text/css; charset=utf-8']],
  ['/pos-demo-wow.css', ['pos-demo-wow.css', 'text/css; charset=utf-8']],
  ['/pos-demo.js', ['pos-demo.js', 'application/javascript; charset=utf-8']]
]);
const server = http.createServer((request, response) => {
  const entry = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(entry ? 405 : 404, entry ? { Allow: 'GET, HEAD' } : {});
    return response.end();
  }
  const file = path.join(root, entry[0]);
  response.writeHead(200, {
    'Content-Type': entry[1],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(file));
});
server.listen(4179, '127.0.0.1', () => console.log('POS example at http://127.0.0.1:4179/pos-demo.html'));

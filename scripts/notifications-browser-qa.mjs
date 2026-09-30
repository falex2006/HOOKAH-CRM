import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_PACKAGE_PATH;
if (!playwrightPath) throw new Error('Set PLAYWRIGHT_PACKAGE_PATH');
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const reservePort = async () => { const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const { port } = server.address(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); return port; };
const port = await reservePort(); const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: '', AUTH_REQUIRED: 'true', DEMO_OWNER_PASSWORD: 'demo' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', (chunk) => { output += chunk.toString(); }); child.stderr.on('data', (chunk) => { output += chunk.toString(); });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
try {
  if (!output.includes('CRM running on')) await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`CRM startup timed out: ${output}`)), 10_000); const ready = (chunk) => { if (String(chunk).includes('CRM running on')) { clearTimeout(timeout); child.stdout.off('data', ready); resolve(); } }; child.stdout.on('data', ready); child.once('error', reject); child.once('exit', (code) => reject(new Error(`CRM exited (${code}): ${output}`))); });
  const loginResponse = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'demo' }) });
  assert.equal(loginResponse.status, 200); const session = await loginResponse.json();
  for (const suffix of ['one', 'two']) {
    const created = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId: `notification-browser-qa-${suffix}` }) });
    assert.equal(created.status, 201); const order = await created.json();
  const deleted = await fetch(`${baseUrl}/api/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: 'Notification browser QA', writeoff: false }) }); assert.equal(deleted.status, 200);
  }
  const emptyAdminCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Notification Empty Inbox QA', role: 'admin', login: `notification_empty_${Date.now()}`, password: 'demo', birthDate: '1990-01-01', permissionScopes: ['inventory'] }) });
  assert.equal(emptyAdminCreate.status, 201);
  const emptyAdminLogin = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: (await emptyAdminCreate.json()).login, password: 'demo' }) });
  assert.equal(emptyAdminLogin.status, 200); const emptyAdmin = await emptyAdminLogin.json();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ token, user }) => { localStorage.setItem('crm_session_token', token); localStorage.setItem('crm_session_user', JSON.stringify(user)); }, { token: session.token, user: session.user });
  const page = await context.newPage(); await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  const bell = page.locator('#notification-bell'); await bell.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#notification-count')?.textContent === '2');
  assert.equal(await bell.getAttribute('aria-label'), 'Уведомления, непрочитанных: 2', 'bell exposes unread count as its accessible name');
  let shouldFailNotificationSource = true;
  await page.route('**/api/notifications**', async (route) => {
    if (shouldFailNotificationSource && route.request().method() === 'GET') {
      shouldFailNotificationSource = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'notifications_unavailable' }) });
    } else await route.continue();
  });
  await bell.click();
  await page.locator('.notification-inline-error').waitFor();
  assert.match(await page.locator('.notification-inline-error').innerText(), /Не удалось обновить/);
  await page.locator('.notification-inline-error button').click();
  await page.locator('.notification-item').first().waitFor();
  await page.unroute('**/api/notifications**');
  await page.keyboard.press('Escape');
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await bell.click();
    const panel = page.locator('#notification-panel'); await panel.waitFor({ state: 'visible' });
    await page.locator('.notification-item').first().waitFor();
    assert.equal(await bell.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#notification-panel-title').textContent(), 'Уведомления');
    assert.equal(await page.locator('.notification-item').count(), 2);
    const bounds = await page.locator('.notification-panel-card').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `tray fits viewport width ${width}`);
    assert.equal(await panel.getAttribute('aria-modal'), width <= 768 ? 'true' : 'false');
    if (width <= 768) {
      const tray = await panel.boundingBox();
      assert.ok(tray && tray.x === 0 && tray.y === 0 && tray.width === width, `tray fills viewport at ${width}px`);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden', `background scroll is locked at ${width}px`);
      const visibleControls = page.locator('#notification-panel button:not(:disabled):not([hidden]), #notification-panel a[href]');
      const firstControl = visibleControls.first(); const lastControl = visibleControls.last();
      await lastControl.focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement), await firstControl.evaluate((node) => node), `focus wraps inside modal tray at ${width}px`);
    }
    assert.equal(await page.locator('.notification-panel-card').evaluate((node) => getComputedStyle(node).animationName), 'none', 'reduced motion disables tray animations');
    if (width === 1440) await page.screenshot({ path: `${process.env.TEMP || process.env.TMP || '.'}/notifications-center-desktop.png` });
    if (width === 375) await page.screenshot({ path: `${process.env.TEMP || process.env.TMP || '.'}/notifications-center-mobile.png` });
    await page.keyboard.press('Escape');
    assert.equal(await panel.isHidden(), true); assert.equal(await page.evaluate(() => document.activeElement?.id), 'notification-bell');
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await bell.click(); await page.locator('.notification-item').first().waitFor();
  const secondPage = await context.newPage(); await secondPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await secondPage.waitForFunction(() => document.querySelector('#notification-count')?.textContent === '2');
  await page.locator('.notification-open-link').first().click();
  await page.waitForURL(/\/orders(?:\?|$)/);
  const targetApi = await page.evaluate(async (token) => (await fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } })).status, session.token);
  assert.equal(targetApi, 200, 'notification navigation reaches the orders route and its permission-checked API');
  await page.waitForFunction(() => document.querySelector('#notification-count')?.textContent === '1');
  await secondPage.waitForFunction(() => document.querySelector('#notification-count')?.textContent === '1');
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#notification-count')?.textContent === '1');
  await page.locator('#notification-bell').click();
  await page.locator('.notification-item.is-unread').waitFor();
  await page.locator('.notification-read-all').click();
  await page.waitForFunction(() => document.querySelector('#notification-count')?.hidden === true);
  await secondPage.waitForFunction(() => document.querySelector('#notification-count')?.hidden === true);
  await page.locator('[data-notification-filter="unread"]').click();
  assert.match(await page.locator('#notification-panel-content').innerText(), /Непрочитанных уведомлений нет/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#notification-count')?.hidden === true);
  await page.locator('#notification-bell').click();
  await page.locator('#notification-panel').waitFor({ state: 'visible' });
  await page.locator('.notification-item').first().waitFor();
  assert.equal(await page.locator('.notification-item.is-unread').count(), 0, 'read-all state persists after reload');
  assert.equal(await page.locator('#notification-count').isHidden(), true, 'read state persists after reload');
  const emptyContext = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  await emptyContext.addInitScript(({ token, user }) => { localStorage.setItem('crm_session_token', token); localStorage.setItem('crm_session_user', JSON.stringify(user)); }, { token: emptyAdmin.token, user: emptyAdmin.user });
  const emptyPage = await emptyContext.newPage(); await emptyPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  const emptyBell = emptyPage.locator('#notification-bell'); await emptyBell.waitFor({ state: 'visible' });
  await emptyPage.waitForFunction(() => document.querySelector('#notification-count')?.hidden === true);
  assert.equal(await emptyBell.getAttribute('aria-label'), 'Уведомления', 'empty inbox keeps a useful accessible bell name');
  await emptyBell.focus(); await emptyPage.keyboard.press('Enter');
  await emptyPage.locator('.notification-state-empty').waitFor();
  assert.match(await emptyPage.locator('.notification-state-empty').innerText(), /Пока нет уведомлений/);
  await emptyPage.keyboard.press('Escape');
  assert.equal(await emptyPage.evaluate(() => document.activeElement?.id), 'notification-bell', 'keyboard-open empty tray restores focus');
  await emptyContext.close();
  await context.close();
  console.log('NOTIFICATIONS BROWSER QA: 503/retry, desktop/tablet/mobile geometry, reduced motion, accessible name, focus trap/Escape, single/read-all, reload, unread filter, and cross-tab sync passed');
} finally { await browser.close(); child.kill('SIGTERM'); }

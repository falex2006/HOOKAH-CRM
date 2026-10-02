const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    windowsHide: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_URL: '', API_RATE_LIMIT: '10000', AUTH_REQUIRED: 'false', DEMO_MODE: 'false', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  let browser;
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Local test server did not start: ${output}`)), 15000);
      server.once('error', reject);
      server.stdout.on('data', () => {
        const match = output.match(/CRM running on http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const login = async (username, password) => {
      const response = await page.request.post(`${base}/api/login`, { data: { username, password } });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).token;
    };
    const ownerToken = await login('admin', 'admin');
    const managerLogin = `view_qa_${Date.now()}`;
    const managerPassword = 'ViewQa1234';
    const created = await page.request.post(`${base}/api/staff`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { name: 'QA управляющий вида каталога', login: managerLogin, password: managerPassword, role: 'manager', birthDate: '1990-01-01' },
    });
    assert.equal(created.status(), 201, await created.text());
    const managerToken = await login(managerLogin, managerPassword);
    const preferences = async (token, method = 'GET', data) => {
      const response = await page.request.fetch(`${base}/api/session/preferences`, {
        method, headers: { Authorization: `Bearer ${token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { data } : {}),
      });
      const body = await response.json();
      return { status: response.status(), body };
    };
    assert.equal((await preferences(ownerToken, 'PATCH', { staffDirectory: { view: 'list', cardScale: 4 } })).status, 200);
    assert.deepEqual((await preferences(ownerToken)).body.preferences.staffDirectory, { view: 'list', cardScale: 4 });
    assert.equal((await preferences(managerToken)).body.preferences.staffDirectory, undefined, 'new account must not inherit owner layout preference');
    assert.equal((await preferences(managerToken, 'PATCH', { staffDirectory: { view: 'table' } })).status, 200);
    assert.deepEqual((await preferences(managerToken)).body.preferences.staffDirectory, { view: 'table' });
    assert.deepEqual((await preferences(ownerToken)).body.preferences.staffDirectory, { view: 'list', cardScale: 4 }, 'manager preference must not overwrite owner preference');
    assert.equal((await preferences(ownerToken, 'PATCH', { staffDirectory: { view: 'cards', cardScale: 5 } })).status, 400, 'scale must be bounded');

    await page.goto(`${base}/login`);
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('admin');
    await page.locator('#login-form button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'));
    await page.goto(`${base}/admin#staff`, { waitUntil: 'networkidle' });
    const views = page.locator('[data-staff-view]');
    await views.nth(1).waitFor();
    assert.ok(await page.locator('.staff-edit').count() > 0, 'profile action must be available in the directory');
    assert.ok(await page.locator('.staff-delete').count() > 0, 'block action must remain available for manageable staff');
    await views.filter({ hasText: 'Таблица' }).click();
    assert.equal(await page.locator('#staff-list').getAttribute('data-view'), 'table');
    assert.ok(await page.locator('.staff-directory-table .staff-edit').count() > 0, 'table must retain profile actions');
    assert.ok(await page.locator('.staff-directory-table .staff-delete').count() > 0, 'table must retain block actions');
    await page.locator('.staff-directory-table thead th').nth(2).waitFor();
    const contactsCell = page.locator('.staff-directory-table tbody .staff-table-contacts').first();
    await contactsCell.evaluate((node) => { node.innerHTML = '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 2h20v20H2z"/></svg><span>+7 (912) 924-79-45</span></span>'; });
    const tableIcon = contactsCell.locator('svg').first();
    assert.deepEqual(await tableIcon.evaluate((node) => ({ width: getComputedStyle(node).width, height: getComputedStyle(node).height, flex: getComputedStyle(node).flexShrink })), { width: '18px', height: '18px', flex: '0' }, 'table contact icons must stay compact and never stretch the row');
    const tableActionBoxes = await page.locator('.staff-directory-table tbody .staff-card-actions button').evaluateAll((nodes) => nodes.map((node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; }));
    for (let index = 1; index < tableActionBoxes.length; index++) {
      const previous = tableActionBoxes[index - 1]; const current = tableActionBoxes[index];
      if (Math.abs(previous.top - current.top) < 2) assert.ok(previous.right <= current.left + 1 || current.right <= previous.left + 1, 'table action buttons must not overlap');
    }
    await views.filter({ hasText: 'Список' }).click();
    assert.equal(await page.locator('#staff-list').getAttribute('data-view'), 'list', 'list mode must render compact rows');
    assert.equal(await page.locator('.staff-card-scale').isVisible(), false, 'tile scale must only appear in card mode');
    const listRow = page.locator('.staff-directory-row').filter({ has: page.locator('.staff-card-actions button') }).first();
    const listBoxes = await listRow.evaluate((node) => [...node.children].map((child) => { const rect = child.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, className: child.className }; }));
    for (let first = 0; first < listBoxes.length; first++) for (let second = first + 1; second < listBoxes.length; second++) {
      const a = listBoxes[first]; const b = listBoxes[second];
      assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, `list content must not overlap: ${JSON.stringify({ a, b })}`);
    }
    await views.filter({ hasText: 'Плитки' }).click();
    assert.equal(await page.locator('#staff-list').getAttribute('data-view'), 'cards');
    const scale = page.getByLabel('Размер плиток сотрудников');
    const measureCard = async (value) => {
      await scale.evaluate((node, nextValue) => { node.value = String(nextValue); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, value);
      await page.waitForFunction((expected) => document.querySelector('#staff-list')?.dataset.cardScale === String(expected), value);
      return page.locator('#staff-list .staff-card').filter({ has: page.locator('.staff-card-actions button') }).first().evaluate((node) => {
        const rect = node.getBoundingClientRect(); const avatar = node.querySelector('.staff-card-avatar').getBoundingClientRect();
        const title = node.querySelector('.staff-card-identity h3'); const role = node.querySelector('.staff-card-identity p');
        const contacts = node.querySelector('.staff-card-contacts'); const button = node.querySelector('.staff-card-actions button');
        return { cardWidth: rect.width, cardHeight: rect.height, avatarWidth: avatar.width, titleSize: parseFloat(getComputedStyle(title).fontSize), roleSize: parseFloat(getComputedStyle(role).fontSize), contactsSize: parseFloat(getComputedStyle(contacts).fontSize), buttonHeight: button.getBoundingClientRect().height };
      });
    };
    const compactCard = await measureCard(1);
    const largeCard = await measureCard(4);
    for (const key of ['cardWidth', 'cardHeight', 'avatarWidth', 'titleSize', 'roleSize', 'contactsSize', 'buttonHeight']) assert.ok(largeCard[key] > compactCard[key], `scale 4 must proportionally increase ${key}: ${JSON.stringify({ compactCard, largeCard })}`);
    assert.equal(await page.locator('.staff-card-scale-value').textContent(), 'Очень крупные', 'scale control must describe the selected size');
    await page.locator('#staff-search').fill('нет такого сотрудника');
    await page.getByText('По текущему поиску и фильтрам сотрудников нет').waitFor();
    await page.locator('#staff-search').fill('');
    await page.locator('[data-staff-view="cards"]').click();
    await page.waitForFunction(() => document.querySelector('#staff-list')?.dataset.view === 'cards');
    assert.ok(await page.locator('.staff-card .staff-edit').count() > 0, 'cards must retain profile actions');
    await page.getByLabel('Размер плиток сотрудников').press('Home');
    await page.waitForFunction(() => document.querySelector('#staff-list')?.dataset.cardScale === '1');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#staff-list').getAttribute('data-view'), 'cards', 'last selected view must persist on reload');
    assert.equal(await page.locator('#staff-list').getAttribute('data-card-scale'), '1', 'smallest card scale must persist on reload');
    for (const width of [390, 620, 768, 912, 1000, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#staff-list').waitFor();
      const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
      assert.ok(layout.page <= layout.viewport + 1, `page must not scroll horizontally at ${width}px: ${JSON.stringify(layout)}`);
      await page.locator('[data-staff-view="cards"]').click();
      const controls = await page.evaluate(() => {
        const switcher = document.querySelector('.staff-view-switch').getBoundingClientRect();
        const scale = document.querySelector('.staff-card-scale').getBoundingClientRect();
        const group = document.querySelector('.staff-directory-view-controls').getBoundingClientRect();
        const label = document.querySelector('.staff-card-scale').getBoundingClientRect();
        const control = document.querySelector('.staff-card-scale-control input').getBoundingClientRect();
        const endpoint = [...document.querySelectorAll('.staff-card-scale-control > span')][1].getBoundingClientRect();
        return { switchBottom: switcher.bottom, scaleTop: scale.top, groupRight: group.right, labelRight: label.right, controlRight: control.right, endpointRight: endpoint.right };
      });
      assert.ok(controls.controlRight <= controls.labelRight + 1 && controls.endpointRight <= controls.labelRight + 1 && controls.labelRight <= controls.groupRight + 1, `scale labels must fit at ${width}px: ${JSON.stringify(controls)}`);
      if (width <= 1000) assert.ok(controls.scaleTop >= controls.switchBottom, `view and size controls must stack at ${width}px: ${JSON.stringify(controls)}`);
      if (width <= 620) {
        await page.locator('[data-staff-view="list"]').click();
        const narrowListBoxes = await page.locator('.staff-directory-row').first().evaluate((node) => [...node.children].map((child) => { const rect = child.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }; }));
        for (let first = 0; first < narrowListBoxes.length; first++) for (let second = first + 1; second < narrowListBoxes.length; second++) {
          const a = narrowListBoxes[first]; const b = narrowListBoxes[second];
          assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, `narrow list content must not overlap at ${width}px: ${JSON.stringify({ a, b })}`);
        }
        await page.locator('[data-staff-view="cards"]').click();
        await page.locator('[data-staff-view="table"]').click();
        await page.locator('.staff-directory-table tbody .staff-table-row').first().waitFor({ timeout: 1000 }).catch(() => {});
        const tableDisplay = await page.locator('.staff-directory-table').evaluate((node) => getComputedStyle(node).display);
        assert.equal(tableDisplay, 'block', 'table should become stacked on narrow screens');
      }
    }
    assert.deepEqual(pageErrors, [], `unexpected browser errors: ${pageErrors.join('; ')}`);
    console.log('PASS staff directory cards/list/table, compact-to-large proportional scale, table contacts/actions and preference isolation; responsive widths 390/620/768/1440');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

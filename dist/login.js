const form = document.querySelector('#login-form');
const setupForm = document.querySelector('#setup-form');
const setupMessage = document.querySelector('#setup-message');
fetch('/api/public/venue-brand').then((response) => response.ok ? response.json() : null).then((brand) => { const node = document.querySelector('[data-login-brand]'); if (!node || !brand?.logoUrl) return; node.innerHTML = `<img src="${brand.logoUrl}" alt="Логотип заведения">`; node.classList.add('has-logo'); }).catch(() => {});
const passwordInput = document.querySelector('#login-password');
const usernameInput = document.querySelector('#login-username');
const clearRememberedCredentials = () => { if (usernameInput) usernameInput.value = ''; if (passwordInput) passwordInput.value = ''; };
window.addEventListener('pageshow', clearRememberedCredentials);
window.setTimeout(clearRememberedCredentials, 0);
const passwordToggle = document.querySelector('#login-password-toggle');
passwordToggle?.addEventListener('click', () => { const visible = passwordInput.type === 'text'; passwordInput.type = visible ? 'password' : 'text'; passwordToggle.textContent = visible ? 'Показать' : 'Скрыть'; passwordToggle.setAttribute('aria-label', visible ? 'Показать пароль' : 'Скрыть пароль'); passwordToggle.setAttribute('aria-pressed', String(!visible)); passwordInput.focus(); });

const demoUsers = {
  'admin:admin': { id: 'demo-admin', name: 'Александр', role: 'admin' },
  'owner:demo': { id: 'demo-owner', name: 'Администратор', role: 'owner' },
  'staff:demo': { id: 'demo-bartender', name: 'Мария', role: 'bartender' },
  'developer:developer': { id: 'demo-developer', name: 'Главный разработчик', role: 'developer' },
};

const setLoginState = (state) => { document.body.dataset.loginState = state; form?.setAttribute('data-login-state', state); };
const showFailureAnimation = () => { setLoginState('idle'); return Promise.resolve(); };
setLoginState('idle');

const showLoginTransition = () => new Promise((resolve) => {
  resolve();
});

const setupPassword = document.querySelector('#setup-password');
document.querySelector('#setup-password-toggle')?.addEventListener('click', (event) => {
  const visible = setupPassword.type === 'text';
  setupPassword.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Показать' : 'Скрыть';
  setupPassword.focus();
});

const showSetupIfNeeded = async () => {
  try {
    const response = await fetch('/api/setup/status', { cache: 'no-store' });
    if (response.status === 404) {
      if (form && setupForm) { form.hidden = true; setupForm.hidden = false; setupForm.querySelector('#setup-venue')?.focus(); }
      return;
    }
    const status = response.ok ? await response.json() : null;
    if (status?.required && form && setupForm) {
      form.hidden = true;
      setupForm.hidden = false;
      setupForm.querySelector('#setup-venue')?.focus();
    } else if (status && !status.required && form && setupForm) {
      setupForm.hidden = true;
      form.hidden = false;
      form.querySelector('#login-username')?.focus();
    }
  } catch (_) {}
};
showSetupIfNeeded();

setupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = setupForm.querySelector('button[type="submit"]');
  const payload = {
    venueName: document.querySelector('#setup-venue').value.trim(),
    ownerName: document.querySelector('#setup-name').value.trim(),
    city: document.querySelector('#setup-city').value.trim(),
    ownerLogin: document.querySelector('#setup-login').value.trim().toLowerCase(),
    ownerPassword: document.querySelector('#setup-password').value,
    timezone: document.querySelector('#setup-timezone').value,
  };
  setupMessage.textContent = 'Создаём рабочее пространство…';
  if (submit) { submit.disabled = true; submit.textContent = 'Создаём…'; }
  try {
    const response = await fetch('/api/setup/owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.status === 404) {
      const owner = { id: `local-owner-${Date.now()}`, name: payload.ownerName, role: 'owner', avatarUrl: null };
      localStorage.setItem('territory_crm_demo_state', JSON.stringify({ venue: { name: payload.venueName, city: payload.city, timezone: payload.timezone }, staff: [{ ...owner, login: payload.ownerLogin, password: payload.ownerPassword, active: true }] }));
      await finishLogin({ token: `demo-static-owner-${Date.now()}`, user: owner });
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'setup_failed');
    const loginResponse = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: payload.ownerLogin, password: payload.ownerPassword }) });
    const loginData = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok) throw new Error(loginData.error || 'login_failed');
    await finishLogin(loginData);
  } catch (error) {
    setupMessage.textContent = error.message === 'owner_login_already_exists' ? 'Этот логин уже занят' : 'Не удалось создать рабочее пространство';
    if (submit) { submit.disabled = false; submit.textContent = 'Создать и войти'; }
  }
});

const finishLogin = async (data) => {
  // A real server session is the source of truth. Clear local demo orders and
  // shift data so an old browser session can never leak fake tables/orders into
  // the newly authenticated workspace.
  if (data?.token && !String(data.token).startsWith('demo-static-')) {
    ['territory_crm_staff_orders', 'territory_crm_shift', 'territory_crm_discount_requests', 'territory_crm_demo_audits', 'territory_crm_seen_discount_notifications', 'territory_crm_seen_staff_pin_notifications'].forEach((key) => localStorage.removeItem(key));
  }
  localStorage.setItem('crm_session_token', data.token);
  localStorage.setItem('crm_session_user', JSON.stringify(data.user));
  setLoginState('idle');
  await showLoginTransition();
  window.location.replace(data.user.role === 'platform_owner' ? '/platform' : ['owner', 'admin', 'developer'].includes(data.user.role) ? '/admin' : '/' );
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const submit = form.querySelector('button[type="submit"]');
  const username = usernameInput.value.trim();
  const password = document.querySelector('#login-password').value;
  clearRememberedCredentials();
  message.textContent = 'Проверяем доступ…';
  if (submit) { submit.disabled = true; submit.textContent = 'Проверяем…'; }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'login_failed');
    finishLogin(data);
  } catch (error) {
    try {
      const state = JSON.parse(localStorage.getItem('territory_crm_demo_state') || '{}');
      const person = (state.staff || []).find((entry) => entry.active !== false && entry.login === username && entry.password === password);
      if (person) { finishLogin({ token: `demo-static-${person.role}-${Date.now()}`, user: { id: person.id, name: person.name, role: person.role, avatarUrl: person.avatarUrl || null } }); return; }
    } catch (_) {}
    const user = demoUsers[`${username}:${password}`];
    if (!user) {
      message.textContent = error?.message === 'too_many_login_attempts' ? 'Слишком много попыток. Повторите позже.' : error?.message === 'session_limit_reached' ? 'Учетная запись уже открыта на двух устройствах. Выйдите на одном из них и повторите вход.' : 'Неверный логин или пароль';
      await showFailureAnimation();
      if (submit) { submit.disabled = false; submit.textContent = 'Войти в систему'; }
      return;
    }
    finishLogin({ token: `demo-static-${user.role}-${Date.now()}`, user });
  }
  if (submit) { submit.disabled = false; submit.textContent = 'Войти в систему'; }
});

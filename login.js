const form = document.querySelector('#login-form');
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

const finishLogin = async (data) => {
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
      message.textContent = error?.message === 'too_many_login_attempts' ? 'Слишком много попыток. Повторите позже.' : 'Неверный логин или пароль';
      await showFailureAnimation();
      if (submit) { submit.disabled = false; submit.textContent = 'Войти в систему'; }
      return;
    }
    finishLogin({ token: `demo-static-${user.role}-${Date.now()}`, user });
  }
  if (submit) { submit.disabled = false; submit.textContent = 'Войти в систему'; }
});

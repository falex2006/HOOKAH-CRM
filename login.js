const form = document.querySelector('#login-form');
const passwordInput = document.querySelector('#login-password');
const passwordToggle = document.querySelector('#login-password-toggle');
const pinInput = document.querySelector('#login-pin');
const pinConfirmInput = document.querySelector('#login-pin-confirm');
const authModeButtons = [...document.querySelectorAll('[data-auth-mode]')];
const authPanels = [...document.querySelectorAll('[data-auth-panel]')];
let authMode = 'password';
const setAuthMode = (mode) => { authMode = mode === 'pin' ? 'pin' : 'password'; authModeButtons.forEach((button) => { const active = button.dataset.authMode === authMode; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); }); authPanels.forEach((panel) => { panel.hidden = panel.dataset.authPanel !== authMode; }); passwordInput.required = authMode === 'password'; pinInput.required = authMode === 'pin'; pinConfirmInput.required = authMode === 'pin'; if (authMode === 'pin') { passwordInput.value = ''; pinInput.value = ''; pinConfirmInput.value = ''; pinInput.focus(); } else { pinInput.value = ''; pinConfirmInput.value = ''; passwordInput.focus(); } };
authModeButtons.forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
passwordToggle?.addEventListener('click', () => { const visible = passwordInput.type === 'text'; passwordInput.type = visible ? 'password' : 'text'; passwordToggle.textContent = visible ? 'Показать' : 'Скрыть'; passwordToggle.setAttribute('aria-label', visible ? 'Показать пароль' : 'Скрыть пароль'); passwordToggle.setAttribute('aria-pressed', String(!visible)); passwordInput.focus(); });

const demoUsers = {
  'admin:admin': { id: 'demo-admin', name: 'Александр', role: 'admin' },
  'owner:demo': { id: 'demo-owner', name: 'Владелец', role: 'owner' },
  'staff:demo': { id: 'demo-bartender', name: 'Мария', role: 'bartender' },
  'developer:developer': { id: 'demo-developer', name: 'Главный разработчик', role: 'developer' },
};

const setLoginState = (state) => { document.body.dataset.loginState = state; form?.setAttribute('data-login-state', state); };
const showFailureAnimation = () => new Promise((resolve) => { setLoginState('failure-animation'); window.setTimeout(() => { setLoginState('error-reset'); window.setTimeout(() => { setLoginState('idle'); resolve(); }, 260); }, 1500); });
setLoginState('idle');

const showLoginTransition = () => new Promise((resolve) => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { resolve(); return; }
  const layer = document.createElement('div'); layer.className = 'login-transition'; layer.setAttribute('role', 'status'); layer.setAttribute('aria-label', 'Открываем рабочее пространство');
  layer.innerHTML = '<div class="login-transition__live-scene" role="img" aria-label="Короткая реалистичная съёмка приготовления кальяна: чаша, табак, калауд, угли и дым"><div class="login-transition__live-photo live-photo-base"></div><div class="login-transition__live-photo live-photo-bowl"></div><div class="login-transition__live-photo live-photo-tobacco"></div><div class="login-transition__live-photo live-photo-metal"></div><div class="login-transition__live-photo live-photo-coals"></div><div class="login-transition__live-haze haze-a"></div><div class="login-transition__live-haze haze-b"></div><div class="login-transition__live-glint"></div></div><p class="login-transition__title">Готовим рабочее пространство</p><button class="login-transition__skip" type="button">Пропустить</button>';
  document.body.append(layer); document.body.classList.add('login-transition-active'); let done = false; const finish = () => { if (done) return; done = true; layer.remove(); document.body.classList.remove('login-transition-active'); resolve(); }; layer.querySelector('.login-transition__skip')?.addEventListener('click', finish); window.setTimeout(finish, 5000);
});

const finishLogin = async (data) => {
  localStorage.setItem('crm_session_token', data.token);
  localStorage.setItem('crm_session_user', JSON.stringify(data.user));
  setLoginState('success-animation');
  await showLoginTransition();
  window.location.replace(data.user.role === 'platform_owner' ? '/platform' : ['owner', 'admin', 'developer'].includes(data.user.role) ? '/admin' : '/' );
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const submit = form.querySelector('button[type="submit"]');
  const username = document.querySelector('#login-username').value.trim();
  const password = document.querySelector('#login-password').value;
  const pin = String(pinInput?.value || '').trim();
  const pinConfirm = String(pinConfirmInput?.value || '').trim();
  if (authMode === 'pin' && !/^\d{4}$/.test(pin)) { message.textContent = 'Введите ровно 4 цифры PIN'; pinInput?.focus(); return; }
  if (authMode === 'pin' && pin !== pinConfirm) { message.textContent = 'PIN-коды не совпадают'; pinConfirmInput?.focus(); return; }
  message.textContent = 'Проверяем доступ…';
  if (submit) { submit.disabled = true; submit.textContent = 'Проверяем…'; }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: authMode === 'password' ? password : '', pin: authMode === 'pin' ? pin : '' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'login_failed');
    finishLogin(data);
  } catch (error) {
    try {
      const state = JSON.parse(localStorage.getItem('territory_crm_demo_state') || '{}');
      const person = (state.staff || []).find((entry) => entry.active !== false && entry.login === username && (entry.password === password || entry.pin === pin));
      if (person) { finishLogin({ token: `demo-static-${person.role}-${Date.now()}`, user: { id: person.id, name: person.name, role: person.role, avatarUrl: person.avatarUrl || null } }); return; }
    } catch (_) {}
    const user = authMode === 'pin' && username === 'staff' && pin === '1234' ? demoUsers['staff:demo'] : demoUsers[`${username}:${password}`];
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

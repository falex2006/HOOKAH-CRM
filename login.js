const form = document.querySelector('#login-form');

const demoUsers = {
  'admin:admin': { id: 'demo-admin', name: 'Администратор', role: 'admin' },
  'owner:demo': { id: 'demo-owner', name: 'Владелец', role: 'owner' },
  'staff:demo': { id: 'demo-bartender', name: 'Мария', role: 'bartender' },
  'developer:developer': { id: 'demo-developer', name: 'Главный разработчик', role: 'developer' },
};

const showLoginTransition = () => new Promise((resolve) => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { resolve(); return; }
  const layer = document.createElement('div'); layer.className = 'login-transition'; layer.setAttribute('role', 'status'); layer.setAttribute('aria-label', 'Открываем рабочее пространство');
  layer.innerHTML = '<div class="login-transition__scene"><div class="login-transition__smoke smoke-a"></div><div class="login-transition__smoke smoke-b"></div><div class="login-transition__bowl"><span class="login-transition__tobacco"></span><span class="login-transition__metal"></span><span class="login-transition__coal coal-a"></span><span class="login-transition__coal coal-b"></span><span class="login-transition__coal coal-c"></span></div></div><p class="login-transition__title">Готовим рабочее пространство</p><button class="login-transition__skip" type="button">Пропустить</button>';
  document.body.append(layer); document.body.classList.add('login-transition-active'); let done = false; const finish = () => { if (done) return; done = true; layer.remove(); document.body.classList.remove('login-transition-active'); resolve(); }; layer.querySelector('.login-transition__skip')?.addEventListener('click', finish); window.setTimeout(finish, 5000);
});

const finishLogin = async (data) => {
  localStorage.setItem('crm_session_token', data.token);
  localStorage.setItem('crm_session_user', JSON.stringify(data.user));
  await showLoginTransition();
  window.location.replace(['owner', 'admin', 'developer'].includes(data.user.role) ? '/admin' : '/');
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const submit = form.querySelector('button[type="submit"]');
  const username = document.querySelector('#login-username').value.trim();
  const password = document.querySelector('#login-password').value;
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
      if (submit) { submit.disabled = false; submit.textContent = 'Войти в систему'; }
      return;
    }
    finishLogin({ token: `demo-static-${user.role}-${Date.now()}`, user });
  }
  if (submit) { submit.disabled = false; submit.textContent = 'Войти в систему'; }
});

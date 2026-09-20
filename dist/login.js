const form = document.querySelector('#login-form');

const demoUsers = {
  'admin:admin': { name: 'Администратор', role: 'admin' },
  'owner:demo': { name: 'Владелец', role: 'owner' },
  'staff:demo': { name: 'Мария', role: 'bartender' },
  'developer:developer': { name: 'Главный разработчик', role: 'developer' },
};

const finishLogin = (data) => {
  localStorage.setItem('crm_session_token', data.token);
  localStorage.setItem('crm_session_user', JSON.stringify(data.user));
  window.location.replace(['owner', 'admin', 'developer'].includes(data.user.role) ? '/admin' : '/');
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const username = document.querySelector('#login-username').value.trim();
  const password = document.querySelector('#login-password').value;
  message.textContent = 'Проверяем доступ…';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'login_failed');
    finishLogin(data);
  } catch {
    try {
      const state = JSON.parse(localStorage.getItem('territory_crm_demo_state') || '{}');
      const person = (state.staff || []).find((entry) => entry.active !== false && entry.login === username && entry.password === password);
      if (person) { finishLogin({ token: `demo-static-${person.role}-${Date.now()}`, user: { name: person.name, role: person.role } }); return; }
    } catch (_) {}
    const user = demoUsers[`${username}:${password}`];
    if (!user) {
      message.textContent = 'Неверный логин или пароль';
      return;
    }
    finishLogin({ token: `demo-static-${user.role}-${Date.now()}`, user });
  }
});

const form = document.querySelector('#login-form');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  message.textContent = 'Проверяем доступ…';
  fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.querySelector('#login-username').value.trim(), password: document.querySelector('#login-password').value }) })
    .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'login_failed'); return data; })
    .then((data) => { localStorage.setItem('crm_session_token', data.token); localStorage.setItem('crm_session_user', JSON.stringify(data.user)); window.location.href = data.user.role === 'owner' || data.user.role === 'admin' ? '/admin' : '/'; })
    .catch(() => { message.textContent = 'Неверный логин или пароль'; });
});

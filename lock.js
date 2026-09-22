(() => {
  const token = localStorage.getItem('crm_session_token');
  if (!token) return;
  let user = {};
  try { user = JSON.parse(localStorage.getItem('crm_session_user') || '{}'); } catch (_) {}

  const staffRoles = new Set(['bartender', 'hookah_master', 'senior_bartender', 'senior_hookah_master']);
  const autoLockEnabled = Boolean(user.pinConfigured) && (location.pathname === '/' || staffRoles.has(String(user.role || '')));
  const inactivityMs = 5 * 60 * 1000;
  let locked = false;
  let timer = null;
  let unlockRequest = null;

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('crm_session_token') || ''}`, 'Content-Type': 'application/json' });
  const logout = async () => {
    try { await fetch('/api/logout', { method: 'POST', headers: headers() }); } catch (_) {}
    localStorage.removeItem('crm_session_token');
    localStorage.removeItem('crm_session_user');
    location.replace('/login');
  };
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/assets/tabler-icons.svg#${name}"></use></svg>`;

  const overlay = document.createElement('div');
  overlay.className = 'screen-lock-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<section class="screen-lock-card" role="dialog" aria-modal="true" aria-labelledby="screen-lock-title">
    <div class="screen-lock-mark">${user.avatarUrl ? `<img src="${String(user.avatarUrl).replaceAll('"', '&quot;')}" alt="">` : String(user.name || 'С').slice(0, 1)}</div>
    <p class="eyebrow">РАБОЧЕЕ МЕСТО ЗАБЛОКИРОВАНО</p>
    <h2 id="screen-lock-title">Вернитесь к работе</h2>
    <p class="screen-lock-user">${String(user.name || 'Сотрудник').replaceAll('<', '&lt;')}</p>
    <p class="screen-lock-hint" id="screen-lock-hint">Введите свой 4-значный PIN, чтобы продолжить.</p>
    <input class="screen-lock-pin" id="screen-lock-pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]{4}" placeholder="••••" aria-label="PIN сотрудника">
    <div class="screen-lock-keypad" aria-label="Цифровая клавиатура">${['1','2','3','4','5','6','7','8','9','⌫','0','Очистить'].map((key) => `<button type="button" data-lock-key="${key}" ${key === 'Очистить' ? 'class="wide"' : ''}>${key}</button>`).join('')}</div>
    <p class="screen-lock-message" id="screen-lock-message" role="alert"></p>
    <button type="button" class="screen-lock-exit" id="screen-lock-exit">${icon('logout')} Выйти из системы</button>
  </section>`;
  document.body.appendChild(overlay);

  const pinInput = overlay.querySelector('#screen-lock-pin');
  const message = overlay.querySelector('#screen-lock-message');
  const hint = overlay.querySelector('#screen-lock-hint');
  const setMessage = (text, kind = '') => { message.textContent = text; message.className = `screen-lock-message ${kind}`; };
  const lock = (reason = 'manual') => {
    if (locked) return;
    locked = true;
    clearTimeout(timer);
    overlay.dataset.reason = reason;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('screen-locked');
    pinInput.value = '';
    setMessage('');
    hint.textContent = reason === 'auto' ? 'Система заблокирована после 5 минут бездействия.' : 'Экран заблокирован вручную.';
    pinInput.focus();
  };
  const schedule = () => { if (autoLockEnabled && !locked) { clearTimeout(timer); timer = setTimeout(() => lock('auto'), inactivityMs); } };
  const unlock = async () => {
    if (unlockRequest || pinInput.value.length !== 4) return;
    unlockRequest = fetch('/api/session/unlock', { method: 'POST', headers: headers(), body: JSON.stringify({ pin: pinInput.value }) }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(payload.error || 'unlock_failed'); error.status = response.status; throw error; }
      locked = false; overlay.setAttribute('aria-hidden', 'true'); document.body.classList.remove('screen-locked'); setMessage(''); schedule();
    }).catch((error) => {
      pinInput.value = '';
      if (error.message === 'pin_not_configured') setMessage('PIN не настроен. Выйдите и обратитесь к администратору.', 'error');
      else if (error.message === 'invalid_pin') setMessage('Неверный PIN. Попробуйте ещё раз.', 'error');
      else setMessage('Не удалось проверить PIN. Проверьте соединение.', 'error');
    }).finally(() => { unlockRequest = null; });
    await unlockRequest;
  };
  pinInput.addEventListener('input', () => { pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4); if (pinInput.value.length === 4) unlock(); });
  overlay.querySelector('.screen-lock-keypad').addEventListener('click', (event) => { const button = event.target.closest('[data-lock-key]'); if (!button) return; const key = button.dataset.lockKey; if (key === '⌫') pinInput.value = pinInput.value.slice(0, -1); else if (key === 'Очистить') pinInput.value = ''; else if (pinInput.value.length < 4) pinInput.value += key; pinInput.dispatchEvent(new Event('input')); });
  overlay.querySelector('#screen-lock-exit').addEventListener('click', logout);

  const addLockButton = (host) => { if (!host || document.querySelector('#lock-screen-button')) return; const button = document.createElement('button'); button.type = 'button'; button.id = 'lock-screen-button'; button.className = 'lock-screen-button'; button.title = 'Заблокировать экран'; button.setAttribute('aria-label', 'Заблокировать экран'); button.innerHTML = `${icon('lock')}<span>Заблокировать</span>`; button.addEventListener('click', () => lock('manual')); host.prepend(button); };
  addLockButton(document.querySelector('.header-right') || document.querySelector('.staff-header-user') || document.querySelector('.user'));
  ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach((eventName) => document.addEventListener(eventName, () => { if (!locked) schedule(); }, { passive: true }));
  schedule();
})();

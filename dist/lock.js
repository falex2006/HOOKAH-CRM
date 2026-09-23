(() => {
  const token = localStorage.getItem('crm_session_token');
  if (!token) return;
  let user = {};
  try { user = JSON.parse(localStorage.getItem('crm_session_user') || '{}'); } catch (_) {}

  const identityKey = String(user.id || user.login || user.name || 'user').trim().toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, '_').slice(0, 80) || 'user';
  const timeoutKey = `crm_lock_timeout_user_${identityKey}`;
  const timeoutOptions = [0, 1, 5, 10, 15, 30];
  const readTimeout = () => { const accountValue = Number(user.preferences?.lockTimeoutMinutes); if (timeoutOptions.includes(accountValue)) return accountValue; try { const value = Number(localStorage.getItem(timeoutKey)); return timeoutOptions.includes(value) ? value : 5; } catch (_) { return 5; } };
  let timeoutMinutes = readTimeout();
  let autoLockEnabled = Boolean(user.pinConfigured);
  const inactivityMs = () => timeoutMinutes * 60 * 1000;
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
    hint.textContent = reason === 'auto' ? `Система заблокирована после ${timeoutMinutes} минут бездействия.` : 'Экран заблокирован вручную.';
    pinInput.focus();
  };
  const schedule = () => { if (autoLockEnabled && timeoutMinutes > 0 && !locked) { clearTimeout(timer); timer = setTimeout(() => lock('auto'), inactivityMs()); } };
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

  const addLockButton = (host) => { if (!host || document.querySelector('#lock-screen-button')) return; const button = document.createElement('button'); button.type = 'button'; button.id = 'lock-screen-button'; button.className = 'lock-screen-button'; button.title = 'Заблокировать экран'; button.setAttribute('aria-label', 'Заблокировать экран'); button.innerHTML = `${icon('lock')}<span>Заблокировать экран</span>`; button.addEventListener('click', () => lock('manual')); host.prepend(button); };
  const settingsDialog = document.createElement('dialog');
  settingsDialog.className = 'lock-settings-dialog';
  settingsDialog.innerHTML = `<form method="dialog" class="lock-settings-card"><div class="lock-settings-head"><div><p class="eyebrow">БЕЗОПАСНОСТЬ</p><h2>Защита экрана</h2><p>PIN нужен только для разблокировки после паузы.</p></div><button type="submit" class="lock-settings-close" aria-label="Закрыть">${icon('x')}</button></div><div class="lock-pin-settings"><div class="lock-settings-section-head"><b>PIN блокировки</b><span class="lock-pin-state" id="lock-pin-state">${user.pinConfigured ? 'Настроен' : 'Не настроен'}</span></div><p class="lock-settings-note">Создайте 4 цифры или введите новый PIN, чтобы изменить текущий.</p><div class="lock-pin-fields"><label>Новый PIN<input id="lock-new-pin" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]{4}" placeholder="••••"></label><label>Повторите PIN<input id="lock-new-pin-confirm" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]{4}" placeholder="••••"></label></div><p class="lock-pin-message" id="lock-pin-message" role="alert"></p></div><div class="lock-settings-section-head lock-timeout-head"><b>Автоблокировка</b><span>по бездействию</span></div><div class="lock-timeout-options" role="radiogroup" aria-label="Интервал автоблокировки">${timeoutOptions.map((value) => `<label><input type="radio" name="lock-timeout" value="${value}"><span>${value ? `Через ${value} мин` : 'Выключена'}</span></label>`).join('')}</div><p class="lock-settings-note">Ручная блокировка остаётся доступной при выключенном таймере.</p><button type="button" class="button primary lock-settings-save">Сохранить настройки</button></form>`;
  document.body.append(settingsDialog);
  const syncSettings = () => settingsDialog.querySelectorAll('input[name="lock-timeout"]').forEach((input) => { input.checked = Number(input.value) === timeoutMinutes; });
  const settingsButton = document.createElement('button'); settingsButton.type = 'button'; settingsButton.className = 'lock-settings-button'; settingsButton.title = 'Настройки автоблокировки'; settingsButton.setAttribute('aria-label', 'Настройки автоблокировки'); settingsButton.innerHTML = icon('settings'); settingsButton.addEventListener('click', () => { syncSettings(); settingsDialog.showModal(); });
  const lockHost = document.querySelector('.header-right') || document.querySelector('.staff-header-user') || document.querySelector('.user');
  addLockButton(lockHost);
  if (lockHost && !document.querySelector('#lock-settings-button')) { settingsButton.id = 'lock-settings-button'; lockHost.prepend(settingsButton); }
  settingsDialog.querySelector('.lock-settings-save').addEventListener('click', async () => { const pinMessage = settingsDialog.querySelector('#lock-pin-message'); const newPin = settingsDialog.querySelector('#lock-new-pin').value.trim(); const confirmPin = settingsDialog.querySelector('#lock-new-pin-confirm').value.trim(); if ((newPin || confirmPin) && (!/^\d{4}$/.test(newPin) || newPin !== confirmPin)) { pinMessage.textContent = 'Введите одинаковый PIN из 4 цифр'; pinMessage.className = 'lock-pin-message error'; return; } const selected = settingsDialog.querySelector('input[name="lock-timeout"]:checked'); timeoutMinutes = Number(selected?.value || 0); const saveButton = settingsDialog.querySelector('.lock-settings-save'); saveButton.disabled = true; try { if (newPin) { const response = await fetch(`/api/staff/${encodeURIComponent(user.id)}/pin`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ pin: newPin }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'pin_save_failed'); user.pinConfigured = true; autoLockEnabled = true; settingsDialog.querySelector('#lock-pin-state').textContent = 'Настроен'; settingsDialog.querySelector('#lock-new-pin').value = ''; settingsDialog.querySelector('#lock-new-pin-confirm').value = ''; pinMessage.textContent = 'PIN сохранён'; pinMessage.className = 'lock-pin-message success'; } user.preferences = { ...(user.preferences || {}), lockTimeoutMinutes: timeoutMinutes }; try { localStorage.setItem(timeoutKey, String(timeoutMinutes)); localStorage.setItem('crm_session_user', JSON.stringify(user)); } catch (_) {} fetch('/api/session/preferences', { method: 'PATCH', headers: headers(), body: JSON.stringify({ lockTimeoutMinutes: timeoutMinutes }) }).catch(() => {}); clearTimeout(timer); schedule(); window.setTimeout(() => settingsDialog.close(), newPin ? 500 : 0); } catch (error) { pinMessage.textContent = error.message === 'staff_pin_key_required' ? 'Не настроено хранилище PIN' : 'Не удалось сохранить PIN'; pinMessage.className = 'lock-pin-message error'; } finally { saveButton.disabled = false; } });
  fetch('/api/session/preferences', { headers: headers() }).then((response) => response.ok ? response.json() : null).then((payload) => { const serverValue = Number(payload?.preferences?.lockTimeoutMinutes); if (!timeoutOptions.includes(serverValue)) return; timeoutMinutes = serverValue; user.preferences = { ...(user.preferences || {}), lockTimeoutMinutes: serverValue }; try { localStorage.setItem(timeoutKey, String(serverValue)); localStorage.setItem('crm_session_user', JSON.stringify(user)); } catch (_) {} clearTimeout(timer); schedule(); }).catch(() => {});
  ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach((eventName) => document.addEventListener(eventName, () => { if (!locked) schedule(); }, { passive: true }));
  schedule();
})();

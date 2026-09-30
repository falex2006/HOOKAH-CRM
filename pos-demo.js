(() => {
  const products = [
    { name: 'Кальян · классический', detail: 'Darkside Blueberry Blast · фанел', price: 1200, category: 'Кальяны', icon: '♨' },
    { name: 'Кальян · премиум', detail: 'MustHave Pinkman · классическая чаша', price: 1600, category: 'Кальяны', icon: '♨' },
    { name: 'Замена чаши', detail: 'Новая чаша и забивка', price: 700, category: 'Кальяны', icon: '♨' },
    { name: 'Лимонад маракуйя', detail: 'Домашний · 400 мл', price: 300, category: 'Напитки', icon: '◒' },
    { name: 'Вода BonAqua', detail: 'Без газа · 500 мл', price: 180, category: 'Напитки', icon: '◌' },
    { name: 'Cola', detail: 'Классическая · 330 мл', price: 250, category: 'Напитки', icon: '◒' },
    { name: 'Чай Earl Grey', detail: 'Чёрный чайник · 600 мл', price: 300, category: 'Чай', icon: '♨' },
    { name: 'Чай с чабрецом', detail: 'Травяной чайник · 600 мл', price: 350, category: 'Чай', icon: '♨' },
    { name: 'Ореховая тарелка', detail: 'Микс орехов · 150 г', price: 420, category: 'Закуски', icon: '◉' }
  ];
  const dialog = document.querySelector('#catalog-dialog');
  const list = document.querySelector('#menu-items');
  const search = document.querySelector('#menu-search');
  const lines = document.querySelector('#order-lines');
  const toast = document.querySelector('#toast');
  const cart = new Map([
    ['Кальян · классический', { ...products[0], quantity: 1, note: 'Darkside Blueberry Blast' }],
    ['Лимонад маракуйя', { ...products[3], quantity: 2, note: 'Домашний · 400 мл' }],
    ['Чай Earl Grey', { ...products[6], quantity: 1, note: 'Чайник · 600 мл' }]
  ]);
  let category = 'all';
  let toastTimer;
  const money = (value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

  function renderMenu() {
    const query = search.value.trim().toLocaleLowerCase('ru');
    const filtered = products.filter((product) => (category === 'all' || product.category === category)
      && `${product.name} ${product.detail}`.toLocaleLowerCase('ru').includes(query));
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'demo-caption';
      empty.textContent = 'Ничего не найдено. Попробуйте изменить запрос.';
      list.append(empty);
      return;
    }
    filtered.forEach((product) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      const icon = document.createElement('span');
      icon.className = 'menu-emoji';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = product.icon;
      const copy = document.createElement('span');
      copy.className = 'menu-copy';
      const name = document.createElement('b');
      name.textContent = product.name;
      const detail = document.createElement('small');
      detail.textContent = product.detail;
      copy.append(name, detail);
      const price = document.createElement('span');
      price.className = 'menu-price';
      price.textContent = money(product.price);
      button.append(icon, copy, price);
      button.addEventListener('click', () => addProduct(product));
      list.append(button);
    });
  }

  function addProduct(product) {
    const existing = cart.get(product.name);
    if (existing) existing.quantity += 1;
    else cart.set(product.name, { ...product, quantity: 1, note: product.detail });
    renderCart();
    dialog.close();
    search.value = '';
    category = 'all';
    document.querySelectorAll('.category').forEach((button) => button.classList.toggle('active', button.dataset.category === 'all'));
    showToast(`${product.name} добавлен в заказ`);
  }

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function renderCart() {
    lines.replaceChildren();
    cart.forEach((item, name) => {
      const article = document.createElement('article');
      article.className = 'order-line';
      const icon = document.createElement('div');
      icon.className = `line-icon ${item.category === 'Кальяны' ? 'hookah-icon' : item.category === 'Чай' ? 'tea-icon' : 'drink-icon'}`;
      icon.textContent = item.icon;
      const info = document.createElement('div');
      info.className = 'line-info';
      const title = document.createElement('b');
      title.textContent = item.name;
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      const note = document.createElement('span');
      note.className = 'line-note';
      note.textContent = item.note;
      info.append(title, detail, note);
      const price = document.createElement('div');
      price.className = 'line-price';
      price.append(document.createTextNode(money(item.price * item.quantity)));
      const quantity = document.createElement('small');
      quantity.textContent = `${item.quantity} × ${money(item.price).replace(' ₽', '')}`;
      price.append(quantity);
      article.append(icon, info, price);
      article.addEventListener('click', () => {
        item.quantity -= 1;
        if (item.quantity <= 0) cart.delete(name);
        renderCart();
      });
      article.title = 'Нажмите, чтобы убрать одну порцию';
      lines.append(article);
    });
    const total = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
    document.querySelector('#subtotal').textContent = money(total);
    document.querySelector('#total').innerHTML = `${escapeHtml(new Intl.NumberFormat('ru-RU').format(total))} <small>₽</small>`;
    document.querySelector('#pay-total').textContent = money(total);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  document.querySelector('#add-item').addEventListener('click', () => { renderMenu(); dialog.showModal(); search.focus(); });
  document.querySelector('#close-catalog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  search.addEventListener('input', renderMenu);
  document.querySelectorAll('.category').forEach((button) => button.addEventListener('click', () => {
    category = button.dataset.category;
    document.querySelectorAll('.category').forEach((tab) => tab.classList.toggle('active', tab === button));
    renderMenu();
  }));
  document.querySelectorAll('.floor-tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.floor-tab').forEach((tab) => tab.classList.toggle('selected', tab === button));
    showToast(`Открыта зона «${button.childNodes[0].textContent.trim()}» · демонстрационный режим`);
  }));
  document.querySelectorAll('.table-card').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.table-card').forEach((table) => table.classList.remove('chosen'));
    button.classList.add('chosen');
    showToast(`Выбран стол ${button.querySelector('.table-top b').textContent} · данные для примера`);
  }));
  document.querySelector('.new-table').addEventListener('click', () => showToast('Создание заказа · демонстрационный режим'));
  document.querySelector('#pay-button').addEventListener('click', () => showToast('Оплата · демонстрационный режим'));
  document.querySelectorAll('.order-actions button').forEach((button) => button.addEventListener('click', () => showToast(`${button.textContent.trim()} · демонстрационный режим`)));
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!dialog.open) { renderMenu(); dialog.showModal(); }
      search.focus();
    }
  });
})();

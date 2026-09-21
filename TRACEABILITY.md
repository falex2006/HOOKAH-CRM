# Матрица готовности CRM

| Требование | Реализация | Проверка |
|---|---|---|
| Рабочее место персонала | `index.html`, `app.js`, `/api/floor`, `/api/orders` | `smoke-test.ps1`, HTTP 200 `/` |
| Гость и заметки заказа | вкладки «Гости» и «Заметки» в `index.html`, привязка через `PATCH /api/orders/:id` | `scripts/local-guest-order.ps1` |
| Панель владельца | `admin.html`, `portal.js`, `/admin/` | HTTP 200 `/admin/`, Sites v52 |
| Роли и ограничения | `rolePermissions` и `denyUnless` в `server.js` | smoke-сценарий ролей |
| VIP-минимумы | `vipRoomMinimums`, `orders.minimumOrderTotal`, reservation deposit guard | сценарий бронирования и закрытия VIP-заказа |
| Поиск Red Bull | `search_aliases`, клиентский фильтр алиасов | русские и английские алиасы |
| Скидки с согласованием | `/api/orders/:id/discount-requests`, `/api/discount-requests/:id/approve|reject` | локальный сценарий: заявка → согласование → оплата с пересчётом и аудитом |
| Разделение заказа | транзакция `order_items` в `server.js` и `schema.sql` | split в smoke-тесте |
| Склад | `/inventory/`, inventory repository, stock movements | API smoke-проверка |
| Финансы | `/finance/`, summary API, audit | API smoke-проверка |
| Бронирования | `/reservations/`, reservation repository | создание и чтение брони |
| Изображения и данные компании | product/staff avatar, phone/logo PATCH | серверная валидация |
| Меню бара и ТТК | `catalog-seed.js`, `output/bar-menu-import-preview.json`, `output/cold-teas-ttk-preview.json`, `output/tea-methods-import-preview.json`, `/api/products`, `/api/recipes` | локально: 75 товаров и 24 технологические карты, включая 18 чайных карт из новых Excel; `scripts/local-tea-catalog.ps1` проверяет импорт |
| Сквозная нагрузочная проверка | `scripts/local-100-orders.ps1` | локально: 100 заказов создано и закрыто, 300 событий аудита |
| Единый локальный приёмочный прогон | `scripts/local-acceptance.ps1` | объединяет маршруты, каталог/ТТК, гостей, 100 заказов, финансы, скидки, VIP, доставку и аудит |
| Статические ассеты страниц | `scripts/local-asset-smoke.ps1` | локально: 13 маршрутов и 19 подключаемых CSS/JS/SVG-ассетов возвращают 200 |
| Адаптивный интерфейс и иконки | `style.css`, `assets/tabler-icons.svg`, `app.js`, `portal.js` | локальная UI-проверка маршрутов и узкой ширины |
| PostgreSQL | `schema.sql`, `seed.sql`, `migrations/001_auth_sessions.sql` | `docker compose config` |
| Production Site | Sites version 42, private URL | deployment status `succeeded` |
| VPS | `deploy-vps.sh`, `migrate-vps.sh`, Nginx, backup | требуется запуск на целевом сервере |

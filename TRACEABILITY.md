# Матрица готовности CRM

| Требование | Реализация | Проверка |
|---|---|---|
| Рабочее место персонала | `index.html`, `app.js`, `/api/floor`, `/api/orders` | `smoke-test.ps1`, HTTP 200 `/` |
| Панель владельца | `admin.html`, `portal.js`, `/admin/` | HTTP 200 `/admin/`, Sites v42 |
| Роли и ограничения | `rolePermissions` и `denyUnless` в `server.js` | smoke-сценарий ролей |
| VIP-минимумы | `vipRoomMinimums`, `orders.minimumOrderTotal`, reservation deposit guard | сценарий бронирования и закрытия VIP-заказа |
| Поиск Red Bull | `search_aliases`, клиентский фильтр алиасов | русские и английские алиасы |
| Скидки с согласованием | `/api/orders/:id/discount-request`, approve/reject | аудит решения |
| Разделение заказа | транзакция `order_items` в `server.js` и `schema.sql` | split в smoke-тесте |
| Склад | `/inventory/`, inventory repository, stock movements | API smoke-проверка |
| Финансы | `/finance/`, summary API, audit | API smoke-проверка |
| Бронирования | `/reservations/`, reservation repository | создание и чтение брони |
| Изображения и данные компании | product/staff avatar, phone/logo PATCH | серверная валидация |
| PostgreSQL | `schema.sql`, `seed.sql`, `migrations/001_auth_sessions.sql` | `docker compose config` |
| Production Site | Sites version 42, private URL | deployment status `succeeded` |
| VPS | `deploy-vps.sh`, `migrate-vps.sh`, Nginx, backup | требуется запуск на целевом сервере |

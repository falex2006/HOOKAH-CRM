# API-контракт MVP

Базовый URL локально: `http://localhost:3000`.

## Служебные
- `GET /api/health` — состояние сервиса.
- `GET /api/products` — активные позиции меню для каталога.
- `GET /api/session?role=<role>` — демонстрационный профиль и разрешения роли.
- `POST /api/login` — вход и выдача bearer-токена.
- `GET/PATCH /api/venue` — карточка компании, телефон, адрес и логотип.
- `GET/POST /api/staff`, `DELETE /api/staff/:id`, `POST /api/staff/:id/avatar` — управление сотрудниками и аватарами.
- `POST /api/staff/:id/archive` — владелец удаляет заранее заблокированного сотрудника из рабочего списка; кадровая и операционная история остаётся в аудите.
- `POST /api/products/:id/image` — загрузка изображения товара (PNG/JPG/WebP до 1.5 МБ).

## Планируемые маршруты
- `POST /api/auth/login` — вход по логину и PIN/паролю.
- `POST /api/auth/lock` — блокировка рабочего экрана.
- `GET /api/floor?zone_id=` — зоны и столы со статусами.
- `GET /api/orders?status=open` — открытые заказы.
- `POST /api/orders` — открыть заказ на стол или свободный чек.
- `POST /api/orders/:id/items` — добавить позицию.
- `PATCH /api/orders/:id/items/:item_id` — изменить количество или станцию.
- `POST /api/orders/:id/split` — разделить позиции по гостям/новый заказ.
- `POST /api/orders/:id/discount-requests` — заявка на скидку.
- `POST /api/orders/:id/payments` — частичный или полный платёж.
- `GET /api/inventory` — остатки и предупреждения.
- `POST /api/audit/events` — внутренний журнал действий.

Каждый изменяющий запрос должен передавать идентификатор сотрудника и создавать событие аудита. Проверка прав выполняется на сервере, а не только скрытием кнопок в браузере.

- POST /api/orders/:id/split — перенос выбранных позиций в новый заказ.

- GET /api/floor — зоны и статусы столов для рабочего экрана.

- GET /api/staff — список сотрудников; POST /api/staff — создание сотрудника с ролью.

### POST /api/orders/:id/close
Закрывает заказ. Для VIP возвращает subtotal, finalTotal и minimumAdjustment; итог не может быть ниже minimumOrderTotal.


- GET /api/venue — профиль площадки и минимумы VIP-комнат.
- GET /api/integrations — статусы будущих интеграций.

- GET /api/metrics — агрегаты для административного обзора.
- GET /api/audit — последние события аудита действий пользователей.
- GET /api/orders?venueId=… — использует PostgreSQL-репозиторий при настроенном DATABASE_URL.
- При `DATABASE_URL` список открытых заказов читает PostgreSQL-репозиторий `db.js`; без переменной используется demo-режим.

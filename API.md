# API-контракт MVP

Базовый URL локально: `http://localhost:3000`.

## Служебные
- `GET /api/health` — состояние сервиса.
- `GET /api/products` — активные позиции меню для каталога.
- `GET /api/session?role=<role>` — демонстрационный профиль и разрешения роли.
- `GET/PATCH /api/session/preferences` — пользовательские настройки аккаунта (таймер блокировки, модули главной, вид выручки и показатели аналитики); сервер валидирует допустимые значения и сохраняет их в PostgreSQL.
- `POST /api/session/unlock` — проверка 4-значного PIN для разблокировки рабочего экрана.
- `GET /api/saas/account` — текущая организация, тариф, лимиты мест/заведений и активное использование (для владельца/администратора).
- `PATCH /api/staff/:id/pin` — сотрудник меняет свой 4-значный PIN; владелец/управляющий может выполнить операцию в рамках управления персоналом.
- `GET /api/notifications` — уведомления владельца/управляющего, включая изменение PIN сотрудником.
- `POST /api/login` — вход и выдача bearer-токена.
- `GET/PATCH /api/venue` — карточка компании, телефон, адрес и логотип.
- `GET/POST /api/staff`, `DELETE /api/staff/:id`, `POST /api/staff/:id/avatar` — управление сотрудниками и аватарами.
- `POST /api/staff/:id/archive` — владелец удаляет заранее заблокированного сотрудника из рабочего списка; кадровая и операционная история остаётся в аудите.
- `POST /api/products/:id/image` — загрузка изображения товара (PNG/JPG/WebP до 1.5 МБ).

## Планируемые маршруты
- `POST /api/auth/login` — вход по логину и PIN/паролю; для сотрудника можно передать `pin` из 4 цифр. Ответ содержит `user.organizationId` для tenant-контекста SaaS.
- `GET /api/floor?zone_id=` — зоны и столы со статусами.
- `GET /api/orders?status=open` — открытые заказы.
- `POST /api/orders` — открыть заказ на стол или свободный чек.
- `POST /api/orders/:id/items` — добавить позицию.
- `PATCH /api/orders/:id/items/:item_id` — изменить количество или станцию.
- `POST /api/orders/:id/split` — разделить позиции по гостям/новый заказ.
- `POST /api/orders/:id/discount-requests` — заявка только на процентную скидку (`type: "percent"`, `value: 1..100`, `reason`).
- `GET /api/discount-requests` — список заявок для финансовых ролей.
- `POST /api/discount-requests/:id/approve` или `/reject` — согласование или отклонение процентной скидки финансовой ролью.
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

### SaaS Control Center
- GET /api/platform/overview — агрегаты организаций, только platform_owner.
- GET /api/platform/organizations — реестр компаний и тарифов, только platform_owner.
- POST /api/platform/organizations — создание организации, первого заведения, trial-подписки и учётной записи владельца (`ownerName`, `ownerLogin`, `ownerPassword`), только platform_owner.

- GET /api/platform/plans — тестовый каталог тарифов, все цены 0 ₽.
- GET/PATCH /api/platform/organizations/:id/subscription — просмотр и переключение тарифа без списаний.

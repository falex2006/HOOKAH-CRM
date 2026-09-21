# Матрица приёмки CRM «Территория»

Документ отделяет фактически подтверждённые результаты от этапов, для которых нужен целевой VPS.

| Область цели | Состояние | Подтверждение |
|---|---|---|
| Премиальная тёмная Velora-тема и единый shell | Подтверждено локально | Браузерная проверка `/admin?qa=final-ui` и `/orders?qa=underline128`; общие `style.css`, `portal.js`, Tabler Icons |
| Фотографическая login-анимация и переход после входа | Подтверждено браузером | `/login?qa=live-login` и `/login.html?qa=live-final`: фотографический фон, 5-секундный переход с дымом/светом, «Пропустить», фирменная форма и открытие `/admin` |
| Desktop/mobile адаптивность | Подтверждено локально | `local-route-smoke.ps1`, UI-проверка на 382–390 px без горизонтального переполнения |
| Рабочее место персонала, столы и заказы | Подтверждено локально | Сквозной сценарий: стол → товар → передача в работу → смешанная оплата → закрытие |
| Брони, VIP-минимумы и скидки | Подтверждено локально | `smoke-test.ps1`, CRUD-контракт и финансовые проверки; VIP 1 500 ₽ / 2 500 ₽ |
| Гости, сотрудники, телефоны, Telegram, аватары и роли | Подтверждено локально | `AUTH_REQUIRED role test: PASS` |
| Визуальная карточка сотрудников и форма телефонов | Подтверждено браузером | `/admin?qa=staff-final#staff`: выравнивание, статусы и компактные действия |
| Финансы, склад, каталог, доставка и аудит | Подтверждено локально | `local-crud-contract.mjs`, smoke-сценарии и локальная приёмка |
| Инфографика и персональные настройки | Подтверждено контрактами и ролями | `local-insights-contract.mjs`, `local-role-contract.mjs`, analytics permission smoke |
| Полный локальный приёмочный прогон | Подтверждено локально | `scripts/local-acceptance.ps1 -BaseUrl http://localhost:3000` — `LOCAL ACCEPTANCE: PASS` |
| Защита локальных файлов и production-пакета | Подтверждено локально | `local-static-boundary.mjs`, `local-deploy-contract.mjs` |
| Визуальные регрессии CSS, action-ссылок и иконок | Подтверждено локально | `local-design-contract.mjs` — актуальный `style.css?rev=128`, без подчёркиваний и со встроенными Tabler Icons |
| Браузерный визуальный QA основных экранов | Подтверждено локально | `/admin?qa=visual-next`, `/orders?qa=visual-orders`, `/inventory?qa=visual-inventory` |
| Зависимости | Подтверждено локально | `npm ci --ignore-scripts`, `npm audit --omit=dev --audit-level=high` — 0 уязвимостей |
| Автоматическое продолжение после лимитов | Подтверждено в Codex | Активный heartbeat `crm`, описание в `HANDOFF.md` |
| PostgreSQL-сохранность после перезапуска | Подтверждено в CI | GitHub Actions job `postgres-persistence`: реальный Postgres-сервис, создание заказа, рестарт CRM и повторное чтение |
| Реальный backup restore | Не подтверждено на этой машине | `verify-backup.sh` готов, но нет production-архива и Docker Engine |
| VPS, домен, HTTPS и боевые секреты | Не выполнено | Финальный внешний этап; использовать `DEPLOYMENT.md` и `nginx/https.conf.example` |
| Post-deploy smoke-проверка | Подготовлено, не выполнено | `post-deploy-acceptance.sh`; запускать после появления VPS, HTTPS и боевой учётной записи |
| Регрессии на GitHub | Подтверждено | `.github/workflows/crm-contracts.yml`; run `35651251737` для `f83adbb` завершён успешно, включая локальный API для role/insights/date-контрактов |

## Следующий запуск

1. Выполнить локальные контракты из `HANDOFF.md`.
2. На целевом VPS создать `.env` с уникальными секретами и `STAFF_PASSPORT_KEY`.
3. Запустить `./deploy-vps.sh`, затем проверить HTTPS, healthcheck, вход по ролям и backup restore.
4. После каждой внешней проверки обновить эту матрицу и `STATUS.md`.

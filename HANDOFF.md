# Передача проекта CRM

## Текущее состояние

- Ветка: `main`.
- Production/VPS: `root@212.192.0.58`, приложение `/opt/territory-crm`, Docker Compose.
- Production URL: `http://212.192.0.58:8080`.
- `/api/health`: `status=ok`, `database=postgres`.
- Домен и HTTPS намеренно не настраивались: домен будет подключён позже.
- Последний локальный commit: `611d47f`.
- Production `server.js` и `db.js` синхронизированы после последнего деплоя.

## Подтверждённые проверки

- Локальный acceptance: `PASS`.
- Warehouse QA: `28 checks passed`.
- Tasks QA: `3 checks passed`.
- Security QA: `PASS`.
- Production warehouse E2E: `PASS`: приход 1 л → 1000 мл → техкарта 200 мл → закрытие заказа → 800 мл → себестоимость 100 ₽.
- Production personnel/cash/finance E2E: `PASS`: сотрудник → PIN → смена с 1000 ₽ → 2 часа → начисление 1000 ₽ → расход зарплаты → закрытие с variance 0 ₽ → ручной расход 125 ₽.
- Production permissions E2E: `PASS`: рабочая роль получает `403` на `/api/staff`.
- Все временные production QA-данные удалены после проверок.
- Production визуально проверены `/inventory` и вкладка «Техкарты`.

## Production-исправления, найденные при E2E

- применена миграция `024_table_capacity_range.sql`;
- применены миграции `025_order_costs.sql` и `026_inventory_subdepartments_catalog.sql`;
- исправлены запросы владения столами через `zones`;
- добавлены приведения статуса стола к PostgreSQL enum `table_status`;
- исправлена защита логической нумерации столов от переполнения;
- исправлен пересчёт закупочной стоимости при приходе в другой единице измерения;
- исправлен расчёт `cash_variance` PostgreSQL при закрытии смены;
- техкарты из `inventory_recipe_cards` участвуют в автосписании и себестоимости.

## Команды проверки

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/local-acceptance.ps1 -BaseUrl http://127.0.0.1:3113
node scripts/warehouse-qa.mjs http://127.0.0.1:3107
node scripts/tasks-qa.mjs
node scripts/security-qa.mjs
node --check server.js
```

Осталось оформить финальную таблицу соответствия всем 34 пунктам исходного ТЗ и отдельно отметить пункты, которые требуют будущего домена/HTTPS или расширения бизнес-правил.

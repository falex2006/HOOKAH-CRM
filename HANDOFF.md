# Передача проекта CRM

## Текущее состояние

- Ветка: `main`.
- Production/VPS: `root@212.192.0.58`, приложение `/opt/territory-crm`, Docker Compose.
- Production URL: `http://212.192.0.58:8080`.
- `/api/health`: `status=ok`, `database=postgres`.
- Домен и HTTPS намеренно не настраивались: домен будет подключён позже.
- Последний локальный commit: `ba7f8ad`.
- Production `server.js` синхронизирован с локальным SHA-256 после последнего деплоя.

## Подтверждённые проверки

- Локальный acceptance: `PASS`.
- Warehouse QA: `28 checks passed`.
- Tasks QA: `3 checks passed`.
- Security QA: `PASS`.
- Production визуально проверены `/inventory` и вкладка «Техкарты».
- Production E2E склада: `PASS`: приход 1 л → остаток 1000 мл → техкарта 200 мл → закрытие заказа → остаток 800 мл → себестоимость 100 ₽.
- Все временные production QA-данные удалены после проверки.

## Production-исправления, найденные при E2E

- применена миграция `024_table_capacity_range.sql`;
- применены миграции `025_order_costs.sql` и `026_inventory_subdepartments_catalog.sql`;
- исправлены запросы владения столами через `zones`, так как таблица `tables` не содержит `venue_id`;
- добавлены приведения статуса стола к PostgreSQL enum `table_status`;
- исправлена защита логической нумерации столов от переполнения при длинных числах в названии;
- исправлен пересчёт закупочной стоимости при приходе в другой единице измерения;
- техкарты из `inventory_recipe_cards` сохраняются и участвуют в автосписании и себестоимости.

## Команды проверки

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/local-acceptance.ps1 -BaseUrl http://127.0.0.1:3113
node scripts/warehouse-qa.mjs http://127.0.0.1:3107
node scripts/tasks-qa.mjs
node scripts/security-qa.mjs
node --check server.js
```

Перед окончательным объявлением этапа завершённым остаётся подтвердить production-сценариями персонал, кассу, финансы и права доступа, затем заполнить таблицу соответствия всем 34 пунктам исходного ТЗ.

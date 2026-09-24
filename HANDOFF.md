# Передача проекта CRM

## Текущее состояние

- Ветка: `main`.
- Рабочая копия после QA должна быть чистой; временные логи не коммитятся.
- Production/VPS: `root@212.192.0.58`, приложение `/opt/territory-crm`, Docker Compose.
- Production URL: `http://212.192.0.58:8080`.
- `/api/health` подтверждён: `status=ok`, `database=postgres`.
- Домен и HTTPS намеренно не настраивались: домен будет подключён позже.
- Последний локальный commit: `657840a`.
- Последний production-код `server.js` синхронизирован с локальным SHA-256.

## Проверенные сценарии

- Локальный acceptance: `PASS`.
- Warehouse QA: `28 checks passed`.
- Tasks QA: `3 checks passed`.
- Security QA: `PASS`.
- Production визуально проверен в браузере: `/inventory`, вкладка «Техкарты», закреплённое боковое меню.
- Миграция `027_inventory_recipe_cards.sql` применена на PostgreSQL; таблица существует.

## Важное по складу

Техкарты из `inventory_recipe_cards` сохраняются в PostgreSQL. При закрытии оплаченного заказа сервер связывает активную техкарту с товаром, проверяет остаток, переводит количество в единицу складской позиции, создаёт движение `out` и записывает себестоимость в `order_costs`.

## Команды проверки

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/local-acceptance.ps1 -BaseUrl http://127.0.0.1:3113
node scripts/warehouse-qa.mjs http://127.0.0.1:3107
node scripts/tasks-qa.mjs
node scripts/security-qa.mjs
node --check server.js
```

Перед заявлением о завершении этапа нужно дополнительно подтвердить в production реальными тестовыми данными пять цепочек из исходного ТЗ и заполнить таблицу соответствия всем 34 пунктам.

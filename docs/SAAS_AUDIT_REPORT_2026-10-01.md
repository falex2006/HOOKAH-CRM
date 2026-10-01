# SaaS Control Center — аудит 01.10.2026

## Исправлено

- Убрана декоративная кнопка «Открыть» с `alert`.
- Добавлена карточка деталей организации.
- Добавлена загрузка подписки через `GET /api/platform/organizations/:id/subscription`.
- Добавлено сохранение тарифа и статуса через `PATCH /api/platform/organizations/:id/subscription`.
- После сохранения список организаций перечитывается.
- Добавлено закрытие модального окна клавишей Escape.
- Сохранена тестовая модель биллинга `test_free`, реальные платежи не включались.

## Проверено

- `node --check platform.js`
- `node scripts/local-platform-organization-contract.mjs`
- `node scripts/local-billing-contract.mjs`
- `node scripts/local-saas-onboarding-contract.mjs`
- `git diff --check`
- VPS SHA: `a4b582d`
- VPS health: PostgreSQL healthy
- Публичная страница `/platform` содержит onboarding-блок «Три шага до готовой компании».
- Публичный `/platform.js` содержит обработчик карточки деталей организации.

## Ограничения

- Полный ручной сценарий с ролью `platform_owner` требует активной авторизованной браузерной сессии.
- Реальный платёжный провайдер, домен и HTTPS остаются отдельным этапом.

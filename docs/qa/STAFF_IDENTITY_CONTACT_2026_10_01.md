# Логин и контактная почта сотрудника — 2026-10-01

## Область

Локальная ветка `codex/staff-identity-contact-20261001`, baseline `9c0b498b`, checkout `HOOKAH CRM 2-reconcile`. Ранее логин задавался только при создании, контактной почты не было. Архитектор подтвердил UI/API контракт, security/data — права и транзакции, code_health_engineer — baseline и итоговый diff. Координатор интегрировал изменения и проверил браузер. Реальные сотрудники и VPS не изменялись.

## Сквозной контракт

| Экран / действие | API | Права / результат |
|---|---|---|
| Команда → Персонал → Карточка | GET /api/staff/:id/profile: login, loginConfigured, email, календарные даты, pinConfigured | Существующие права чтения, tenant фильтр, скрытые credential hashes |
| Изменить логин | PATCH /api/staff/:id/profile, login | staff_manage; owner/admin/developer защищены правом владельца; собственный логин работника запрещён |
| Изменить почту | Тот же PATCH, email string/null | Существующие права карточки/своих контактов; пустое значение очищает поле |
| Создать сотрудника | POST /api/staff, необязательный email | Существующие права создания и те же проверки |
| Повторный вход | POST /api/login | Старый логин отклонён, новый использует прежний пароль; PIN разблокировки сохраняется |

Логин: trim, 3–32 символа, буквы латиницы/кириллицы, цифры, дефис/подчёркивание; регистр значим, как в существующем входе/UNIQUE. Занятые логины, включая неактивные/удалённые аккаунты, отклоняются409; настроенные системные имена зарезервированы. Учётка без пароля не получает неявный доступ от переименования.

Почта: trim, до254 символов, серверная проверка синтаксиса и нормализация домена. Это контактная, неподтверждённая почта. Отправка писем, вход по email и восстановление пароля не входят в функцию.

Checkbox подтверждает смену логина. Профиль, логин, удаление auth_sessions и аудит staff.login_updated сохраняются в одной PG транзакции; ошибка откатывает всё. Пароль/PIN сохраняются. Email-only и no-op login сохраняют сеансы. Блокировка строки пользователя при выдаче сеанса закрывает гонку входа/rename. Собственный rename перенаправляет на вход; заполненный новый PIN нужно сначала отдельно сохранить, чтобы действие не потерялось при выходе.

Аудит включает исполнителя, старый/новый логин и завершение сеансов; email скрыт в аудите профиля, секреты и документы удаляет общий privacy helper. DTO не выдают хеши и PIN secrets. Demo/memory ветки имеют согласованные проверки и атомарное применение после validation.

## Данные и обнаруженные дефекты

Миграция057 добавляет nullable users.contact_email без UNIQUE/backfill/обязательного заполнения; повторное применение проверено. Чтение старой схемы отдаёт email null через to_jsonb; запись без миграции503. Новый server helper включён в Dockerfile. Source/dist синхронизированы: portal421, card11, style372.

Браузер выявил старый дефект: ISO timestamp из PostgreSQL не принимался HTML date input и сохранение очищало дату начала работы. Теперь даты выдаются через to_char YYYY-MM-DD; регрессия проверяет birth/employment dates. Исправлен старый ложный статус PIN: API выдаёт pinConfigured/pinUpdatedAt без секрета. В светлой теме устранён низкий контраст старого PIN блока и селекторов в границах карточки.

## Проверки и доказательства

- Полный `node scripts/local-full-qa.mjs --all`: **170/170 PASS** (число скриптов/guards, не процент полного покрытия).
- PG identity: **134 assertions PASS** — email CRUD, уникальность, tenant/roles, rollback профиля/аудита, hashes, revocation, old/new login, даты и PIN state.
- PG race: **20 assertions PASS**, оба порядка блокировки входа/rename, inactive/deleted/mismatch.
- После client guard demo/фактический submit handler: **69 checks PASS**; собственный rename+PIN блокируется до PATCH. Backend после полного прогона не менялся.
- После последних CSS/документов `node scripts/local-full-qa.mjs --static`: **126/126 PASS**; новый скриншот подтвердил контраст PIN блока.
- Syntax, diff check, source/dist parity и visual-page-rules contract PASS.

CUA на локальной синтетической базе31932, desktop1280×720: отсутствие подтверждения блокирует save; occupied login409 сохраняет ввод и не применяет email; новый login/email сохраняются после reload; email clear работает; employment03.06.2026 сохраняется после email-only update; old login неверен, новый открывает нужного сотрудника; администратор видит логин разработчика readonly с объяснением. Тестовый логин возвращён к исходному для seeder. Обе темы просмотрены; modal width620px, scrollWidth=clientWidth608, горизонтального overflow нет. Proof tmp/full-local-qa/staff-identity-*.png ignored, credentials вне Git.

Мобильная/Fold проверка приостановлена пользователем. Коммит/GitHub/VPS функции ещё не выполнялись; локальный PASS не является production доказательством.

Основания: [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) и [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Завершение сеансов при rename — политика проекта; полная сертификация приложения не заявляется.

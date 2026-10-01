# Приватность журнала аудита — локальное QA 01.10.2026

Роль: `security_reviewer` (после аудита `data_engineer`). Production не подключался и не изменялся.

## Первопричина

`PATCH /api/staff/:id/profile` шифровал паспорт в выделенных полях users, но передавал `publicPerson.passportData` в `recordAudit`. `AuditRepository.record` сохранял payload целиком, `AuditRepository.list` отдавал его без redaction. `/api/audit` доступен manager через settings, хотя staff_sensitive у него отсутствует.

В наполненной локальной QA БД воспроизведено до исправления: 3 зашифрованных synthetic passport в users, 3 audit payload со значением passportData; manager API audit HTTP200 и наличие паспортного payload=true. Сами значения, пароли, токены и контакты не печатались.

Это нарушение границы чувствительных данных. Добавление поля только в зашифрованную таблицу не защищало его вторую копию в audit JSON.

## Исправление координатора

- `audit-privacy.js`: рекурсивное удаление credential/PIN/passport ключей, включая snake/camel/case варианты; ordinary action/amount и pinConfigured/pinUpdatedAt сохраняются.
- `db.js`: redaction перед INSERT и при выдаче ранее записанных audit rows.
- `server.js`: memory audit на записи/чтении очищается и фильтруется по venue; PostgreSQL read failure возвращает503, не подменяется memory журналом.
- `Dockerfile`: новый module включён в образ.

Основную интеграцию сделал координатор. По его отдельному назначению роль безопасности расширила `audit-privacy.js` aliases newPassword/oldPassword/ownerPassword, apiToken/sessionToken, cookie/cookies/set-cookie, authorization/proxy-authorization и regression cases. `code_health_engineer` проверяет итоговый diff.

## Исполненный regression

Файл: `scripts/audit-privacy-postgres-qa.mjs`.

Команда локальной подготовленной среды:

```powershell
node scripts/local-full-pg-regression.cjs scripts/audit-privacy-postgres-qa.mjs
```

Guard требует `MIGRATIONS_PG_TEST_DATABASE_URL`, loopback PostgreSQL port31931, имя test/qa/scratch БД и явно проверенный disposable Docker container через штатный `assertQaDatabaseIdentity`. Filled интерактивная БД31930 не принимается. HTTP servers используют свои свободные loopback порты, fixtures — собственные случайные UUID двух организаций, двух venues и owner/manager/developer/hookah_master. Удаляются только fixture UUID после подтверждённой идентичности БД. Деструктивных операций над существующими данными и остановки общего PostgreSQL нет.

Проверки:

1. Recursive redactor удаляет sensitive keys из объектов и массивов, сохраняя amount и PIN metadata.
2. Реальный owner HTTP profile PATCH сохраняет encrypted паспорт users; новый audit JSON не содержит его копии или credential ключей.
3. Прямой `AuditRepository.record` защищает вложенные данные независимо от server caller.
4. В disposable БД создаётся historical plaintext audit fixture. Raw строка остаётся без переписывания, но direct repository read и HTTP owner/manager/developer GET удаляют sensitive keys. Action, entity/id и amounts читаются правильно.
5. Второй tenant видит только свой audit event, operational employee получает403, запрос без авторизации401.
6. Для PostgreSQL fault поднимается отдельный child с **несуществующим QA database name**; существующие БД не модифицируются. Auth bypass только в этом fault child нужен для проверки downstream audit503, поскольку при полном отказе БД штатный persisted auth раньше отвечает401. Основной RBAC regression всегда `AUTH_REQUIRED=true`.
7. Отдельный no-database child создаёт две synthetic организации через platform API; memory audit каждого owner не содержит event другого venue.
8. Child processes остановлены, owned PostgreSQL fixtures удалены.

Результат: **PASS**, повтор после расширения aliases также PASS (2.6 секунды). `node --check` также PASS. До исправления реальное доказательство утечки было получено в наполненной QA БД; regression assertions на new-row и historical-read removal ломаются на прежних реализации repository/server.

## Защита локальной среды

По поручению координатора усилен `scripts/local-full-qa-setup.cjs`: нельзя переиспользовать одноимённый контейнер только на основании image/label/ports. Persistent QA требует ровно один writable volume с точным именем `hookah-full-local-qa-data-20261001` в `/var/lib/postgresql/data`, без autoRemove. Regression требует autoRemove и ровно один anonymous data volume с Docker именем из64hex, без bind mount. Имена обоих контейнеров, образ `postgres:16-alpine`, config порты, HostConfig и live network публикация должны совпасть с объявленными127.0.0.1:31930/31931. Дополнительные публикации и mounts отвергаются. PostgreSQL URL собирается через URL.username/password, чтобы спецсимволы credentials не могли подменить loopback host.

- `node scripts/local-full-qa-setup.cjs --check-guards`: **PASS**, 30 positive/negative cases, Docker и SQL не вызываются.
- `node scripts/local-full-qa-setup.cjs --inspect-guards`: **PASS**, фактические два контейнера проверены read-only без старта/миграций.
- Syntax и scoped diff whitespace check: **PASS**.

Аналогичный exact named persistent volume guard усилен у сидера; потерянный manifest при наличии созданных fixtures означает остановку перед бизнес POST.

## Ограничения и дальнейший владелец

- Redaction защищает выдачу существующей истории и новые записи; старые plaintext значения физически не удаляются из audit_events. Production очистка/миграция чувствительных исторических строк — отдельное решение координатора, с backup и точным scope.
- При полном отказе PostgreSQL platform login может вернуть200, а следующий authenticated request401 из-за persisted-session lookup до infrastructure memory fallback. Это fail closed; доступность SaaS owner в таком outage требует отдельного auth решения. Здесь этот контракт не изменялся.
- Не следует писать секреты в свободное поле note/description: фильтрация ключей не распознаёт смысл произвольного текста.
- Поддерживаемые sensitive aliases проверены вложенными synthetic cases. Новые типы credential key при расширении API должны добавляться в общий audit контракт и regression.

Дальнейшая интеграция, повторное локальное desktop QA и публикация — координатор. Этот отчёт не заявляет проверку всего приложения или production после исправления.

# Локальный полный QA — code health, 01.10.2026

## Границы и исходное состояние

Рабочее дерево: `HOOKAH CRM 2-reconcile`, исходный HEAD `c4e000bc53630c5d1353d53f0cf188a42cec6616`. Main checkout с незавершёнными черновиками и VPS не изменялись этим агентом. Пользователь запросил полный локальный QA и исправления; мобильная/Fold адаптация остаётся на паузе.

Роль: `code_health_engineer`. Прочитаны профиль роли, AI_ORCHESTRATOR, AI_TEAM_WORKFLOW, AI_TEAM, package.json и действующий CRM contracts workflow. Начальный tracked checkout был чистым, кроме игнорируемых QA артефактов в tmp. Продуктовый код изменяет координатор.

## Выполненные проверки

| Проверка | Команда / способ | Результат |
|---|---|---|
| Static и VM baseline | `node tmp/code-health-baseline-runner.cjs`; каждый перечисленный ниже скрипт запускается через `node scripts/<имя>` | До исправлений QA: 109/118 PASS; повтор с новой schedule проверкой: 119/119 PASS; дополнительные итоговые suites перечислены ниже |
| Изолированные memory API runtime | `node tmp/code-health-runtime-runner.cjs`; каждый скрипт сам создаёт сервер с `DATABASE_URL=''`, тестовым окружением и loopback host | 17/17 PASS |
| Синтаксис tracked JS/MJS/CJS вне dist | `git ls-files '*.js' '*.mjs' '*.cjs'` → `node --check <файл>` | 237 файлов, 0 ошибок |
| Синтаксис итоговых source и scripts, включая новые файлы | `git ls-files --cached --others --exclude-standard` → JS/MJS/CJS вне dist/tmp → `node --check <файл>` | 251 файл, 0 ошибок |
| Ошибки чтения настоящих routes | `node scripts/local-api-read-failure-qa.mjs` | 9 PASS: 403 без прав; 503 при configured DB outage/missing repository; no demo fallback для products/payroll-employees/reservations-guests |
| Пробелы/diff | `git diff --check` | PASS; предупреждения Git только о нормализации LF/CRLF |
| Зависимости | `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| Финансовый PostgreSQL fixture | `node tmp/full-local-pg-regression.cjs scripts/finance-employee-postgres-qa.mjs` | PASS, 38 проверок с persisted auth, tenant/date scope, overnight и partial receipts, согласованием summary/dashboard/report |
| Полный PostgreSQL regression | `node tmp/full-local-pg-regression.cjs scripts/postgres-qa.mjs` | PASS, 16 suites на отдельной одноразовой локальной БД, порт 31931; перед записями проверены actual database/address/port/superuser и container loopback identity |
| Дополнительный PostgreSQL regression | `node tmp/code-health-pg-extended.cjs` | PASS, 6 suites; свежие shifts_qa, notifications_qa и territory_qa БД созданы после проверки target и удалены после тестов |
| Итоговый tracked полный runner после bootstrap/route исправлений | `node scripts/local-full-qa.mjs --all` | 167/167 PASS: 2 guard, 123 static/VM, 17 memory API, 25 PostgreSQL suites; 01.10.2026 11:10:52–11:12:38 UTC |
| Повтор после launcher-only credential escaping исправления | `node scripts/local-full-qa.mjs --static` | 125/125 PASS: 2 guard, 123 static/VM suites; actual launcher regression включён в navigation suite |

Временные runners и полные stdout/stderr хранятся в tmp, не входят в пакет. Это число скриптов, а не обещание полного покрытия всех ветвей приложения. В PostgreSQL использованы только synthetic UUID fixtures; guard до записи, scoped cleanup/rollback после проверки. Браузерные проверки выполняются отдельно координатором; не следует считать их подтверждёнными только этим отчётом.

## Найденные до текущих продуктовых исправлений проблемы QA

Все девять ошибок были воспроизведены на baseline. Их первопричина — устаревшие моки или слишком узкие маркеры извлечения действующего кода. Не менялись продуктовые правила ради зелёных тестов.

| Файл | Причина baseline FAIL | Исправление проверки |
|---|---|---|
| dashboard-overnight-employee-demo-qa | Вырезался только внутренний GET notifications после переработки общей ветки; незакрытый внешний блок | Исполняется вся настоящая ветка, keyed storage, реальные нормализованные ID и DTO; сохранены deny, tenant isolation и privacy |
| demo-scenario-contract | Старый синхронный marker чтения demo floor | Проверяется actual async loader и выбранная venue |
| finance-api-consistency-contract | Между plan и updated_at появился is_active | Проверяются все три поля и WHERE id, timestamp не исключён |
| finance-chart-empty-state-contract | Удалён старый marker окончания payment handler | Handler ограничен настоящим renderFinanceShift; сохранено отсутствие старой closure после reload |
| loyalty-program-pending-qa | Новый expense-form добавлен после loyalty в shared exclusion list | Проверяется наличие loyalty в настоящем исключающем submit handler независимо от последнего элемента |
| portal-api-auth-qa | Отсутствовал реальный portalNotificationCenter mock; ReferenceError раньше removeItem | Объявленный dispose mock, отдельное утверждение остановки observer; сохранены storage failure, 401/403 и demo кейсы |
| portal-context-refresh-qa | Не подключены refreshPortalShiftState/publishPortalShift; старое число запросов | Исполняются настоящие shared functions; проверяются один coalesced shift request, stale context, all/partial errors и восстановления |
| staff-catalog-load-state-contract | Loader использует shared staffFetchJson вместо локального response.ok | Проверяется настоящая HTTP error boundary плюс cleared catalog/error/retry/escaped name |
| ui-scenarios-contract | Item id теперь зафиксирован до async write как itemId | Проверяется явный /orders/orderId/items/itemId с DELETE/PATCH |

Владелец: code_health_engineer. Приоритет P2 (проверки перестали защищать актуальный код). Все девять повторно PASS.

## Дополнительные наблюдения

1. P1, существовавший до пакета: PostgreSQL `GET /api/products` при ошибке repository мог вернуть sample memory catalogue с HTTP 200. Воспроизведение: configured PostgreSQL repository.list throws → catch без ответа → memory products. Сценарий передан координатору/backend; координатор исправил fail-closed 503, regression с injection проверяется его пакетом.
2. P2, finance-employee-postgres-qa: synthetic venue/users были без organization_id и active membership/subscription. AUTH_REQUIRED login корректно отклонял старый fixture как organization_context_required. Исправлен сам fixture: отдельная organization/subscription, membership обоим пользователям, scoped UUID cleanup, session org/venue assertions, URL loopback/test guard и database identity. Ещё prior-day payment использовал DEFAULT now(), несмотря на вчерашнее закрытие заказа: receipt получил явно вчерашний created_at, expected revenue 150 сохранён. После продуктовой правки employee report добавлены overnight (40 вчера, 60 сегодня), open partial 20, receipt-free closed check, closed today с оплатой 30 вчера и same-actor foreign-organization 1000. Все три endpoints показывают 230 полученных сегодня, closed checks 4 считаются отдельно. DTO, forged date/type/shift и actor/tenant exclusions проверены. Auth/RBAC не ослаблялись. Повтор 38 checks PASS.
3. В ходе параллельной правки сначала временно падали source/dist parity и reservation-form marker. После coordinator sync portal rev418 и актуализации reservation fixture повторный baseline 118/118 PASS.
4. P2, paid-order-balance-postgres-qa: AUTH_REQUIRED=false запускал approval с default demo actor, отсутствующим в synthetic users, и получал approved_by FK failure вместо paid-total guard. Fixture теперь проходит настоящий scrypt login, organization/subscription/membership и persisted session; все balance/rollback/close assertions сохранены. PASS.
5. P2, recipe-depletion-pg-runtime-qa: тест ошибочно ожидал глобальный timezone fallback при ещё валидной organization timezone. В соответствии с действующим finance-timezone-contract проверены обе ступени: invalid venue → valid organization; invalid venue и organization → Asia/Yekaterinburg. Обе summary/report работают; fixture восстанавливает обе зоны. PASS, 296 assertions.
6. P1, существовавший до пакета: employee summary считал оплаты по p.created_at, employee X report — оплаты закрытых заказов по o.closed_at. При частичной оплате через полночь суммы расходились. Координатор и архитектор согласовали и исправили отчёт: own receipts today по p.created_at, closed-check count отдельно; управленческий X report сохранён. Regression 38 checks выше подтверждает исправление; static finance employee/UI contracts обновлены под настоящий финансовый контракт.
7. P2, дополнительный PG QA: session-preferences-postgres-qa зависел от заранее существующего fixed QA user. Теперь он сам создаёт synthetic org/subscription/venue/admin с scrypt и active membership, сохраняет все старые alias/legacy credential denial, concurrent preferences merge и failed session persistence tests, затем удаляет свой fixture. PASS.
8. P2, notifications-postgres-qa: fixture создавал organization без subscription/membership и получал organization_suspended. Добавлены настоящие active subscription/memberships, auth не ослаблен. Сам тест допускает только notifications_qa БД и проверяет destructive source failure только в свежей отдельной БД, которую временный runner удалил после прогона. PASS.

## Точное перечисление static/VM команд

Для каждой строки ниже команда — `node scripts/<имя файла>`.

```text
admin-section-heading-contract.mjs
ai-team-contract.mjs
auth-smoke-crop-contract.mjs
auth-smoke-lifecycle-runtime-qa.mjs
auth-smoke-runtime-qa.mjs
auto-order-pending-qa.mjs
brand-kit-contract.mjs
client-form-race-qa.mjs
client-form-submit-qa.mjs
client-history-date-qa.mjs
clients-editor-contract.mjs
custom-select-groups-qa.mjs
dashboard-greeting-contract.mjs
dashboard-kpi-design-contract.mjs
dashboard-overnight-employee-demo-qa.mjs
dashboard-overnight-employee-memory-qa.mjs
dashboard-shift-attribution-contract.mjs
dashboard-shift-deeplink-contract.mjs
delivery-ui-state-qa.mjs
demo-premix-unit-runtime-qa.mjs
demo-scenario-contract.mjs
directory-rename-runtime-qa.mjs
discount-groups-demo-qa.mjs
final-acceptance-matrix-contract.mjs
finance-api-consistency-contract.mjs
finance-categories-ui-contract.mjs
finance-chart-empty-state-contract.mjs
finance-employee-contract.mjs
finance-expense-payroll-status-contract.mjs
finance-load-race-qa.mjs
finance-report-date-qa.mjs
finance-required-marker-contract.mjs
finance-timezone-contract.mjs
header-shell-contract.mjs
hookah-additional-acceptance-contract.mjs
integrations-scope-contract.mjs
integrations-state-qa.mjs
inventory-context-contract.mjs
inventory-critical-state-qa.mjs
inventory-form-pending-qa.mjs
inventory-hierarchy-contract.mjs
inventory-movement-transaction-qa.mjs
inventory-premix-load-state-qa.mjs
inventory-stock-status-qa.mjs
inventory-subdepartment-api-qa.mjs
local-click-contract.mjs
local-date-contract.mjs
local-design-contract.mjs
local-insights-contract.mjs
local-lock-contract.mjs
local-preferences-contract.mjs
local-role-contract.mjs
local-schedule-validation-qa.mjs
login-error-runtime-qa.mjs
login-server-identity-runtime-qa.mjs
loyalty-program-pending-qa.mjs
metrics-database-failclosed-contract.mjs
migrations-contract.mjs
mode-navigation-contract.mjs
network-action-pending-qa.mjs
network-load-state-qa.mjs
order-attention-qa.mjs
order-close-transaction-qa.mjs
order-item-close-guard-qa.mjs
order-journal-display-contract.mjs
orders-history-qa.mjs
orders-receipt-qa.mjs
orders-total-qa.mjs
paid-order-balance-demo-qa.mjs
payroll-calculation-qa.mjs
payroll-lifecycle-runtime-qa.mjs
payroll-register-load-state-qa.mjs
payroll-register-ui-contract.mjs
platform-saas-contract.mjs
portal-action-keyboard-qa.mjs
portal-api-auth-qa.mjs
portal-context-refresh-qa.mjs
pos-modal-a11y-contract.mjs
premix-batch-lifecycle-qa.mjs
premix-contract.mjs
premix-create-route-qa.mjs
premix-submit-pending-qa.mjs
product-form-pending-qa.mjs
purchase-document-date-contract.mjs
purchase-document-pending-qa.mjs
purchase-document-validation-qa.mjs
purchase-documents-contract.mjs
purchase-payment-api-validation-qa.mjs
purchase-payments-runtime-qa.mjs
recipe-chain-contract-qa.mjs
recipe-depletion-pg-contract.mjs
recipe-form-pending-qa.mjs
reservation-form-qa.mjs
session-venue-contract.mjs
shift-close-ui-qa.mjs
shift-state-runtime-qa.mjs
shift-transaction-qa.mjs
sidebar-brand-contract.mjs
sidebar-navigation-contract.mjs
site-structure-contract.mjs
staff-active-count-contract.mjs
staff-catalog-add-pending-qa.mjs
staff-catalog-load-state-contract.mjs
staff-guests-page-contract.mjs
staff-header-actions-runtime-qa.mjs
staff-mode-navigation-contract.mjs
staff-observer-stability-runtime-qa.mjs
staff-partial-payment-pending-qa.mjs
staff-pin-passport-contract.mjs
staff-session-recovery-runtime-qa.mjs
staff-worklog-runtime-qa.mjs
task-deadline-qa.mjs
task-ui-recovery-qa.mjs
tobacco-catalog-demo-qa.mjs
trusted-pin-return-contract.mjs
ui-scenarios-contract.mjs
visual-live-defects-contract.mjs
visual-page-rules-contract.mjs
session-authority-qa.mjs
```

К итоговому tracked runner добавлены ещё четыре static/VM suites:

```text
local-api-read-failure-qa.mjs
local-employee-report-ui-qa.mjs
local-navigation-state-qa.mjs
local-dashboard-navigation-qa.mjs
```

Они проверяют actual-source read failure guards (9 cases), employee report UI/demo и bootstrap (36 scenarios), переход «Задачи» в настоящий `/admin#tasks` с сохранением workspace, SaaS initial/hashchange active/aria states и local launcher escaping/target guard (123 cases), единый dashboard route/scroll lifecycle (27 scenarios). Итоговый static allowlist содержит 123 suites.

При интеграции единого navigator дополнительно синхронизированы старые admin-section-heading, dashboard-shift-deeplink, sidebar-navigation, visual-page-rules contracts: проверяются общие initial/hashchange target mappings, один listener, header offset и запрет geometry animation при route scroll. Это согласовано координатором с прежним требованием пользователя убрать мерцание. local-design и platform-saas contracts теперь проверяют точные revision keys из sync-published-assets вместо устаревшего platform rev4; проверка продвижения SaaS revision сохранена.

## Точное перечисление memory API команд

Для каждой строки команда — `node scripts/<имя файла>`.

```text
discount-groups-memory-qa.mjs
finance-rbac-runtime-qa.mjs
local-static-boundary.mjs
notifications-api-qa.mjs
order-delete-qa.mjs
order-journal-table-memory-qa.mjs
paid-order-balance-memory-qa.mjs
recipe-depletion-runtime-qa.mjs
role-api-matrix-runtime-qa.mjs
security-default-credential-qa.mjs
security-qa.mjs
session-preferences-concurrency-qa.mjs
staff-pin-passport-runtime-qa.mjs
tasks-qa.mjs
tobacco-catalog-api-qa.mjs
trusted-pin-return-runtime-qa.mjs
venue-timezone-validation-runtime-qa.mjs
```

## Точное перечисление PostgreSQL suites

Общая команда `node tmp/full-local-pg-regression.cjs scripts/postgres-qa.mjs` последовательно выполняет следующие скрипты с общим проверенным local QA target. Пароли/URL хранятся только в приватном временном runtime config.

```text
payroll-lifecycle-migration-preflight.mjs
migrations-pg-upgrade-qa.mjs
migrations-pg-runtime-qa.mjs
migrations-pg-041-recovery-concurrency-qa.mjs
venue-inventory-departments-postgres-qa.mjs
purchase-payment-postgres-api-qa.mjs
guest-loyalty-postgres-api-qa.mjs
finance-categories-postgres-api-qa.mjs
payroll-lifecycle-postgres-api-qa.mjs
tasks-postgres-e2e-qa.mjs
delivery-persistence-qa.mjs
finance-employee-postgres-qa.mjs
shift-cash-postgres-e2e-qa.mjs
finance-shift-analytics-postgres-qa.mjs
paid-order-balance-postgres-qa.mjs
recipe-depletion-pg-runtime-qa.mjs
```

## Дополнительные PostgreSQL suites

Команда `node tmp/code-health-pg-extended.cjs`, выполняется последовательно:

```text
dashboard-pending-metrics-postgres-qa.mjs
session-preferences-postgres-qa.mjs
shift-notifications-e2e-qa.mjs
notifications-postgres-qa.mjs
purchase-auto-order-postgres-e2e-qa.mjs
saas-quota-suspension-postgres-qa.mjs
```

SaaS тест использовал отдельный AUTH_REQUIRED=true server с temporary synthetic platform-owner credentials, переданными только в child env. Проверены quota seats/venues, гонки, membership, reactivation, suspension и resume. Действующий демонстрационный сервер и пользователи не использовались.

Компания/company-venue и dashboard-overnight PostgreSQL скрипты содержат Playwright и не запускались через CLI. Их desktop user flow остаётся за CUA проверкой координатора. Premix lifecycle fake repository покрыт в static/VM, настоящий PG lifecycle — 296 assertions recipe depletion suite.

## Docker package и запуск контейнера

Команда `node tmp/code-health-docker.cjs` собрала отдельный image `hookah-local-full-qa:code-health-20261001`. Временный контейнер `hookah-local-code-health-20261001` имел точный ownership label `com.hookahpos.qa-owner=code-health-20261001`, единственный published port `127.0.0.1:31933:3000`, ноль mounts, `AUTH_REQUIRED=true`, `DEMO_MODE=false` и memory database. Для входа использовались только временные synthetic platform-owner credentials; они не записаны в отчёт или image. После проверки контейнер удалён с повторной проверкой ownership label.

Результат: PASS. Docker health `healthy`; `/api/health` — HTTP200, database `memory`; `/login`, `/`, `/style.css`, `/portal.js`, `/header-shell.js`, `/notification-center.js`, `/auth-smoke.js`, `/assets/brand/hookah-pos-lockup-light-animated.svg` — HTTP200 с правильными content types. `/api/session`, `/api/products`, `/api/floor`, `/api/audit`, `/api/platform/organizations` без авторизации — HTTP401. `admin/admin` отклонён HTTP401. Synthetic platform-owner login и session — HTTP200 с правильной ролью и HttpOnly cookie. `audit-privacy.js` успешно загружается; отдельный image smoke подтверждает удаление вложенных password/PIN/passport полей при сохранении business полей. `.env`, `.git`, `tmp` отсутствуют в image. Runtime: Node `v20.20.2`, pg `8.23.0`.

Окончательный fingerprint после bootstrap, navigation и local launcher исправлений, сборка 2026-10-01 11:14:21 UTC:

- Image ID: `sha256:e918ebb2eabafb4806dc17eebf22e887a9056a347f90c8665bd5268b77c31c8b`.
- Source manifest SHA256 (360 файлов, включая Dockerfile): `418a8e227690cb2647f4f5155b02ef32860d8a57fd87901296b132aa987894c6`.
- Packaged manifest SHA256 (359 файлов Docker COPY): `b6a7caaee0cc2cdae7c40f2a2de116283057abba0a74b55593f2dd9ccc33f9d3`.

Каждый packaged файл совпал по SHA256 с исходным снимком; исходные файлы не изменились между началом и окончанием проверки. При последующих изменениях source этот image потребуется пересобрать. Подробные локальные proof файлы: `tmp/code-health-docker-results.json`, `tmp/code-health-docker-manifest.json`, `tmp/code-health-docker-build.log`; они не входят в image и не предназначены для коммита. Этот smoke проверяет упаковку и HTTP/auth boundary; полноценный PostgreSQL и browser QA описаны отдельно.

## Воспроизводимый tracked runner

Добавлены `scripts/local-full-qa.mjs` и `scripts/local-full-pg-regression.cjs`. Первый содержит проверенные явные списки 123 static/VM, 17 memory API и 25 PostgreSQL suites (16 основных, 6 дополнительных, audit privacy, scoped role dependencies, reservation local date). Второй принимает только известные имена PostgreSQL тестов, по умолчанию `postgres-qa.mjs`, читает ignored private config и до любых записей проверяет exact disposable container, ownership label, anonymous volume, loopback port31931 и настоящую PostgreSQL identity. Унаследованные DB endpoints и credentials не передаются тестам. Отдельные блокировки защищают от одновременного запуска двух полных runners и двух PostgreSQL runners.

Extra notifications/shift/purchase выполняются в созданных самим runner свежих QA databases с повторной проверкой target перед cleanup. Существующие extra databases не принимаются. SaaS quota использует собственный временный app с synthetic platform-owner credentials. Результаты и sanitized logs сохраняются только в ignored `tmp/full-local-qa/`; ошибка останавливает последовательный прогон и возвращает nonzero exit code. Browser automation и production endpoints в allowlists отсутствуют.

Команды:

```text
node scripts/local-full-qa.mjs --list
node scripts/local-full-qa.mjs --check-guards
node scripts/local-full-qa.mjs --static
node scripts/local-full-qa.mjs --memory
node scripts/local-full-qa.mjs --postgres
node scripts/local-full-qa.mjs --all
node scripts/local-full-pg-regression.cjs --check-guards
node scripts/local-full-pg-regression.cjs --guard
node scripts/local-full-pg-regression.cjs scripts/finance-employee-postgres-qa.mjs
```

На этапе подготовки runner проверены обе syntax checks, 29 positive/negative PG runner guards, companion setup guards и read-only disposable target verification — PASS. Дополнительно 8 CLI commands подтвердили exit1 для unknown/browser/path traversal тестов, лишних аргументов и чужого активного lock; lock не изменялся, после удаления своего test lock guard runner завершился exit0 с точным summary. Эти guard проверки не запускают PostgreSQL записи или browser automation. Окончательная Docker сборка включает tracked runners; полный финальный запуск описан в итоговой проверке ниже.

## Итоговая проверка diff

Review охватил guards/DTO/tenant scope новых floor, payroll employee и reservation guest read routes, fail-closed products, staff tasks navigation, SaaS hash active state, employee payment-day report, audit redaction, desktop light CSS и packaging. Найденный при review bootstrap gap для cleaner/security/technician/other_staff исправлен координатором: разрешён собственный finance portal, fallback permissions согласованы с server finance_read; API grants не расширены. Actual bootstrap positive/negative regressions входят в employee UI36 suite. Ранее неверное предположение о default orders этих ролей исправлено: operations доступны только при реальном orders grant из сессии.

После внесённых исправлений блокирующих findings в просмотренном diff не осталось. Это заключение относится к проверенным контрактам и локальной среде, не обещает математически полное покрытие всех пользовательских сочетаний. Browser QA и seed manifest подтверждает координатор отдельно. Этот отчёт не разрешает production публикацию.

Full-run source проверен 01.10.2026 11:10:52–11:12:38 UTC: `--all`, exit0, 167/167 PASS. После него изменились только local launcher и его VM regression: `encodeURIComponent` сохраняет специальные `@/?#` символы внутри username/password без подмены host/port/path/query/hash; missing credentials и non-QA targets отклоняются до загрузки server. Повтор `--static` завершён 11:13:47–11:13:58 UTC, exit0, 125/125 PASS. Generic `tmp/full-local-qa/local-full-results.json` перезаписывается каждым запуском; release review обновил его guard smoke 2/2. Исторические результаты 167/167 и 125/125 и точное время зафиксированы здесь. PostgreSQL после launcher-only исправления повторно не запускался по решению координатора, поскольку продуктовый код и PostgreSQL tests не изменились. Финальный Docker fingerprint выше относится к пакету с новым launcher и его regression. Временные runner locks после завершения отсутствуют.

## Неблокирующий технический долг

Часть старых проверок извлекает участки больших app.js/portal.js/server.js по текстовым маркерам. Это позволило воспроизвести реальные guards и async handlers, но делает сами тесты чувствительными к рефакторингу без изменения поведения. При последующих изменениях разумно постепенно переносить чистые helper-функции в модули и тестировать их напрямую; текущая задача не расширялась до массового рефакторинга. Для оставшихся извлечений добавлены явные проверки границ и реальные зависимости вместо ослабления assertions.

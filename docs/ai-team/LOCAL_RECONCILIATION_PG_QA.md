# Local reconciliation PostgreSQL QA

Date: 2026-10-01

Environment: disposable PostgreSQL container on `127.0.0.1:55434`, database `hookah_qa`, and CRM on `http://127.0.0.1:3107`. Production, GitHub, and the VPS were not used.

## Database and migration evidence

- Loaded `schema.sql` and `seed.sql` into the disposable database.
- Applied all 56 migrations with `node scripts/migrate.js`.
- `node scripts/migrations-pg-upgrade-qa.mjs` passed: 38 baseline migrations, 18 newer migrations, legacy records preserved, quantity precision verified, rollback verified.
- `local-postgres-contract.mjs` created the seeded persistence fixture successfully.

## Staff runtime evidence

- Owner login, synthetic manager login, and Roman QA employee login returned HTTP 200.
- Roman session returned the server identity and permissions `floor`, `orders`, `hookah_tasks`, `finance_read`.
- Roman inventory and reservation reads returned HTTP 403.
- Roman venue PATCH returned HTTP 403.
- Trusted PIN return with configured owner PIN returned HTTP 200; invalid PIN returned HTTP 401.
- Synthetic Roman QA employee PIN was configured through the owner API; the PIN value is intentionally omitted from this report.

## Persistence and restart evidence

The browser smoke flow created one open order on `Стол 1` with one `Кальян — Darkside Blueberry` item at quantity 2. A direct PostgreSQL query confirmed exactly one order and one item. After stopping and restarting the CRM process, Roman login, `/api/session`, `/api/floor`, `/api/orders`, and `/api/health` all returned HTTP 200, and `/api/orders` returned the same order and quantity 2.

## Logout regression

After the logout fix, a fresh Roman token was used for `POST /api/logout`. The same bearer token then returned HTTP 401 from `/api/session`, and a direct `auth_sessions` query found zero rows for its token hash.

Session creation keeps the configured per-user device limit. Browser verification must therefore reuse its current token/device rather than creating extra CLI logins for the same user, which could rotate the oldest session.

## Live handles

- CRM process: terminal session `62004`, port 3107.
- PostgreSQL container: `hookah-qa-pg-live`, port 55434.

These were temporary handles during the audit, not a persistent user service. The coordinator later restarted CRM in its own terminal session for final browser QA. After acceptance, the temporary CRM, proxy fixtures and memory QA process were stopped; `hookah-qa-pg-live` and its disposable anonymous volume were removed. Existing project containers were preserved.

## Coordinator CUA evidence

- The same Roman browser session survived a CRM restart without another password login; table1 reopened the same Darkside Blueberry quantity2/total2400 order.
- Invalid staff PIN showed the expected error; correct PIN restored clickable orders. Confirmed logout redirected to login.
- Synthetic owner password login, manual PIN lock, invalid/valid trusted PIN return, and correct owner identity were checked through CUA.
- On mobile375×667, the numeric PIN keypad unlocked the screen; video paused after unlock. Opening the navigation drawer exposed logout, which successfully redirected to login. Clicking a hidden/inert drawer control was not treated as a working visible path.
- Smoke browser/fixture evidence and media quality limits are documented in `../requirements/AUTH_SMOKE_BACKGROUND.md`. No production credentials or business data were used.

## Browser restart evidence

With a fresh Roman browser session already open, the CRM process was restarted without creating any additional API login. After reload, the same browser session survived; the workspace showed `Стол 1`, the Darkside Blueberry item at quantity 2 and total 2400. A wrong PIN displayed an error, while the configured PIN unlocked the workspace. Browser logout redirected to `/login`.

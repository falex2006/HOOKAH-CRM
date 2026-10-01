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

Keep both live for the coordinator's CUA reload and browser smoke verification. Remove them after that verification.

## Browser restart evidence

With a fresh Roman browser session already open, the CRM process was restarted without creating any additional API login. After reload, the same browser session survived; the workspace showed `Стол 1`, the Darkside Blueberry item at quantity 2 and total 2400. A wrong PIN displayed an error, while the configured PIN unlocked the workspace. Browser logout redirected to `/login`.

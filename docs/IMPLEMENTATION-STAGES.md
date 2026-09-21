# CRM implementation stages

## Completed and verified

- **Foundation and routing** — 13 local routes, static boundary checks, browser resources.
- **Roles and access** — 7 roles with permission contract and staff/operator restrictions.
- **Staff workstation** — floor tables, editable table layout, orders, quantities, statuses, transfer, split, guest attachment, payment methods and logout.
- **Orders and deposits** — VIP minimums, partial payments, approved percentage discount flow, closing and audit events.
- **Clients and staff records** — guests, multiple phones, Telegram, avatars, personnel data and restricted passport fields.
- **Catalog and inventory** — tea recipes, products, categories, visual product cards and inventory operations.
- **Finance and operations** — shifts, finance categories/reporting, reservations, delivery and integrations sections.
- **Login and visual system** — Velora dark theme, responsive layouts, realistic hookah photo, animated smoke, failure/success states and reduced-motion support.
- **Local acceptance** — route, role, asset, login, catalog, CRUD, guest order, 10 test orders, audit and smoke checks pass.\r\n- **Browser order flow QA** — opened a table, added lemonade and Red Bull, bound a guest, submitted a 10% discount request, split one item into a new order, and completed mixed cash/card partial payment.

## Next stages

1. Visual QA of every administrative route at desktop, tablet and mobile widths.
2. End-to-end browser QA for every visible button, form, filter, modal and navigation transition.
3. Functional gap closure from QA findings; add only missing behavior.
4. Final local acceptance and GitHub checkpoint.
5. VPS deployment preparation and deployment as the final stage.

## Rule

When a stage is verified, record its evidence here and do not repeat that stage unless a later change invalidates its evidence. Report completion to the owner before starting the next stage.

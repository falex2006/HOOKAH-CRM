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
- **Local acceptance** — route, role, asset, login, catalog, CRUD, guest order, 10 test orders, audit and smoke checks pass.\r\n- **Browser order flow QA** — opened a table, added lemonade and Red Bull, bound a guest, submitted a 10% discount request, split one item into a new order, and completed mixed cash/card partial payment.\r\n- **Role access QA** — all 7 role contracts and 13 route checks pass; restricted roles do not receive finance/inventory permissions, while owner/admin/developer scopes match their requirements.\r\n- **Staff management QA** — created a staff account in the browser with role, Telegram and two phone numbers, verified both numbers in the API, and verified the blocked state in the staff list. Fixed creation-form merging so dynamic and legacy phone fields are both persisted.

- **Responsive route QA** — checked 11 administrative routes at 642px and 360px viewport widths; document and body widths stayed within the viewport and horizontal overflow remained hidden on every route.

- **Staff card modal QA** — verified the edit-card action opens once, the close control remains visible on a narrow viewport, and both close actions remove the modal without submitting data. Removed the duplicate editor binding and capped modal height with internal scrolling.

- **Login live-photo QA** — replaced the drawn hookah transition scene with the supplied realistic hookah photo, cinematic camera push, haze, glint and reduced-motion fallback; verified the success state in the local browser and login contract.

- **Admin form QA** — verified inventory product creation cancellation with an exact control locator; hidden form state is restored after cancel, while the staff card modal close path is verified above.

- **Search, filters and report QA** — verified guest empty-search state, inventory search narrowing to the matching item, financial report generation with a report identifier, and audit filtering/reset with owner access.

## Next stages

1. Visual QA of every administrative route at desktop, tablet and mobile widths.
2. End-to-end browser QA for every visible button, form, filter, modal and navigation transition.
3. Functional gap closure from QA findings; add only missing behavior.
4. Final local acceptance and GitHub checkpoint.
5. VPS deployment preparation and deployment as the final stage.

## Rule

When a stage is verified, record its evidence here and do not repeat that stage unless a later change invalidates its evidence. Report completion to the owner before starting the next stage.

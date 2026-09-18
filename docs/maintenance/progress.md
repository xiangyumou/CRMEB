# Maintenance implementation status

This record distinguishes changes in this working tree from the broader maintenance plan. Nothing here has been deployed.

| Batch | State | Evidence / remaining work |
| --- | --- | --- |
| P0 | Implemented | Architecture and tracked baseline inventory, PHP 7.4 syntax gate, regression, H5/MP-WEIXIN static checks, CI admin build and no-fix lint command. New checks run through `sh scripts/check-maintenance.sh`. |
| P1 | Partial | Shared DIY removed-page data moved under `crmeb/config`, cleanup delegated; unused points API deleted. Bargain, seckill, lottery, distribution and 118 shared legacy references need reachability auditing, historical-data checks and separate cleanup. No dependencies removed without evidence. |
| P2 | Partial | Order presentation, dashboard statistics, coupon and freight-template calculation extracted with public delegating methods. Legacy branches in create/product/user services remain; group and presale end-to-end coverage remains incomplete. |
| P3 | Partial | DIY registry contract and stale-component skip, cashier WeChat-only selection, three WeChat payment adapters and one corrected import. Order pages and admin product/editor pages still need deeper component extraction and on-device verification. Admin does not currently offer authoring components for `newVip` or `presale`; only persisted client components and links are retained. |
| P4 | Partial | Admin `dist/` output, Node 20.19.0/npm 10.8.2 clean build, release manifest validation and written rollout steps. HBuilderX version, actual H5/MP-WEIXIN builds, saved mini-program review package, real gateway refund/payment and production-db-copy migration rehearsal are not verified. |

Do not infer that a passing static check certifies a real uni-app build or that the checked-in `public` output is ready to deploy. The old activity pages remain in `pages.json` until their callers, deep links and archived-order behavior are resolved. `docs/maintenance/inventory.json` records the current first confirmed deletion, while `docs/core-store-shared-retained.json` remains the reference set for the wider audit.

The two paragraphs below describe the earlier hiding-based passes and are kept as
history: the hiding mechanism they name (`core_store_removed_admin.json`) was
removed by the retired-feature deletion recorded further down, which is the
current state.

The admin 404 repair is recorded in `docs/maintenance/request-audit.json`. It removes the user list's two retired mount-time requests, user-facing exited filters and actions, and old DIY link requests; keeps historical response fields. Seeded link categories for removed activities are filtered by exact name while group-buying and coupon links remain visible. `core_store_removed_admin.json` drives admin page/menu cleanup and reversible migration. The maintenance check passed (108 tests, 595 assertions), and the admin built in an isolated directory with existing CSS order warnings. Browser network traces, a staging proxy/cache drill, a database-copy migration rehearsal and real H5/MP-WEIXIN builds have not been completed; do not treat this repair as release sign-off.

A second admin pass fixes the blank configuration pages left by that removal. Every page reusing `pages/setting/setSystem/index.vue` now falls back to `setting/config/edit_basics` instead of the deleted `marketing/integral_config` alias, `SystemConfigServices::$postUrl` no longer offers the deleted `agent`/`marketing` save targets, and the electronic-invoice form saves through `setting/config/save_basics`. The 数据配置 page's sign/recharge table header uses the retained `setting/group_data/header`. Retired entries and requests were removed from the retained order list, refund list and send/refund dialogs (offline payment, write-off, integral refund, courier list), and the courier, write-off, sign, recharge, cashier, app-version and upgrade menus are hidden through `core_store_removed_admin.json`. `libs/socket.js` upgrades `ws://` URLs with the existing `wss()` helper, and `libs/request.js` no longer prints the base URL twice. `tests/static/admin-api-contract.cjs` now fails when a retired endpoint reappears in a reachable page. The maintenance check passed again (108 tests, 595 assertions) and the admin was rebuilt with Node 20.19.0; `crmeb/public/admin` and `.build/release/admin` were replaced with that build. The reused configuration pages were driven page-by-page against a local Compose stack through the admin API (18 pages, correct form action, retired endpoints answering HTTP 404), and the `ws://`-to-`wss://` upgrade was confirmed against a TLS front-end. No browser backend was available for console and network traces, and no H5/MP-WEIXIN build, staging drill or database-copy rehearsal was performed in this pass.


## Retired-feature removal (2026-09-17)

The retired features are no longer hidden; they are gone from the backend, the admin
and the database.

- **Backend:** retired services, DAOs, models, jobs, listeners, controllers, route
  files and the whole `kefuapi` application deleted, with the alipay/allinpay/transfer
  drivers and the third-party live-chat provider. The order pipeline (pay success,
  refund, cart, freight, create, read, delivery, take, split) no longer reads or
  writes any retired field. Refunds replay WeChat Pay only; historical orders show
  `历史：…` pay labels and are refused for original-channel refunds.
- **Notifications:** order alerts and mobile order management read the retained
  `order_notice_admin_uids` setting instead of the removed `store_service` roster.
- **Admin:** retired pages, routes, API modules and the menu-filter hiding layer
  deleted; retained pages lost the matching filters, columns, form fields and
  pay-type options. Channel-code and customer pickers use the retained user list.
  The presale admin gained the `marketing/advance` route group its pages call.
- **Database:** `upgrade/core-store/drop-retired.php` replaces the hiding migration.
  `plan` is read-only, hashes the protected tables server-side (a shop with real
  orders does not need the tables in memory) and refuses apply while withdrawals
  still under review, unshipped historical balance/offline orders, unfinished
  member/recharge or points-mall orders exist. `apply` removes the retired settings,
  tabs, menus, timers and group data inside one transaction, creates the retained
  settings, config tab and presale menus an old database never had, merges the
  notification roster (`notify` or `customer` grantees, union with the configured
  list) and exports unreachable balances to CSV — then renames the retired tables
  outside the transaction, recording each name in the backup before it runs, so an
  interrupted run is recoverable. `rollback` restores names and rows, requires
  `--force` when the protected tables drifted, and fails after `finalize` instead of
  reporting success. `finalize` needs a `--dump` naming every table it drops.
  Timers are matched by exact mark, so `takeDelivery` and `clearPoster` survive.
  The install SQL carries none of the retired tables or seeds, re-homes the retained
  invoice/capital-flow/billing menus under their retained parents, keeps the
  customer-service tab that holds `customer_qrcode`, and restores the home-page
  banner groups the storefront reads.
- **Maintenance tools:** `SystemClearServices` holds the retained table map used by
  both "clear data" and "replace site url"; missing tables are skipped with a log
  line, a failing table is reported without aborting the rest, and the console
  `util replace` delegates to the same list.
- **Guards:** `tests/static/retired-code-guard.cjs` fails on any retired identifier
  in the backend or admin source; `tests/static/admin-api-contract.cjs` is now a
  forward check that every admin call path resolves to a registered route;
  `RouteIntegrityTest` asserts every route target resolves to a real controller
  method; `HistoricalOrderCompatTest` and the rewritten `CoreStoreMigrationTest`
  cover historical orders and the plan/apply/rollback/finalize cycle.

The maintenance check passes (125 tests, 511 assertions, plus the static gates) and
`crmeb/public/admin` was rebuilt with Node 20.19.0 / npm 10.8.2. Not verified: real
H5/MP-WEIXIN builds, on-device flows, production gateway payment/refund, and a
plan/apply rehearsal on a production database copy — the operator must settle
withdrawals, self-pickup and historical balance orders before applying.

## Production-copy rehearsal (2026-09-17)

The migration was rehearsed against a copy of the pre-cleanup schema (157 tables)
seeded with users holding balances, historical `yue`/`offline`/`alipay`/seckill/
bargain/pickup orders, open withdrawals, an unfinished points-mall order and a
pending recharge. The rehearsal surfaced four defects that an empty test database
could not, all now fixed and covered by regression:

- **Order relations.** Removing the retired feature deleted model relations that
  the order DAOs still eager-loaded, so the admin order list, refund list and
  invoice pages answered `method not exist` as soon as the table held rows.
  `StoreOrder::user()` is restored, `spread`/`division` are dropped from the
  queries, and `tests/static/model-relation-guard.cjs` fails on the next stale
  `with()`. `HistoricalOrderCompatTest` now drives the DAO list with real rows.
- **Refund channel check.** `assertWechatRefundable(array $order)` received a
  model from the refund dispatcher and aborted every refund, not only historical
  ones. It now accepts either. Verified live: historical orders are refused with
  the offline-handling message, a WeChat order reaches the payment driver.
- **Unreachable balances.** The plan's balance query used a field-restricted
  `find()` with no `where`, which think-orm answers with an empty result, so a
  funded database reported zero. The plan now reports real totals and the CSV
  lists every affected account for offline compensation.
- **Pickup liability.** Paid self-pickup orders awaiting write-off became
  unfulfillable once the store module was dropped; they now block `apply`
  alongside withdrawals and unfinished historic orders.

Driving the admin UI over 113 menu pages against the migrated database found one
further regression: the WeChat public-account menu routes had been dropped with
the retired ones although the controller, service and DAO were retained. Restored.

Rollback restores table names and rows exactly; the second `apply` reported
`Already migrated`. Remaining out-of-scope items in the local stack: the `/notice`
WebSocket needs the workerman container, the courier list needs a CRMeb cloud
token, and the file manager needs its own login.

The maintenance check passes (132 tests, 545 assertions, plus the static gates).

## Retired-feature round two (2026-09-18)

A review of the deletion round found eleven defects that the green gates could
not see, because the guards matched by prefix and the regression suite had no
seeded data. The backend, migration and maintenance fixes are on this branch;
this section records what the database and tooling work changed and what was
re-verified.

- **Migration.** `apply` now removes rows and verifies inside one transaction and
  renames tables outside it, recording each name in the backup before the rename,
  so an interrupted run is recoverable and a failure prints the already-renamed
  list. Settlement checks were corrected against the real enums (a completed
  withdrawal no longer blocks apply, the points-mall status list matches the
  shipped one), timers are matched by exact mark rather than substring (so
  `takeDelivery` and `clearPoster` survive), the roster takes the union of
  `notify` and `customer` grantees and merges with the configured list, and
  `finalize` requires a dump naming every table it drops.
- **Install SQL.** The retained invoice, capital-flow and billing menus are
  re-homed under their retained parents instead of being left behind a removed
  one; the customer-service tab that holds `customer_qrcode` is restored; the
  home-page banner groups and the `clearPoster` timer are back; the dead
  personal-centre menu seeds are gone; retired settings and orphan rows are
  removed.
- **Maintenance tools.** "Clear data" and "replace site url" share one retained
  table map, skip tables that no longer exist, and report per-table instead of
  aborting midway. The mobile order-management middleware whitelist is deleted.
- **Verification.** A migrated shop now matches a fresh install on menus,
  configs, tabs, groups, group data and timers (byte-compared, names included).
  The full cycle was re-run on the seeded production copy: plan → apply →
  rollback restores the exact prior state, and finalize refuses without a dump
  and makes a later rollback fail loudly. The maintenance check passes
  (151 tests, 613 assertions, plus the static gates), and the guards were
  confirmed to fail when a retired table name or a rollback-clobbering edit is
  reintroduced.

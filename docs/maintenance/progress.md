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
  `plan` is read-only and refuses apply while withdrawals, unshipped historical
  balance/offline orders, unfinished member/recharge or points-mall orders exist.
  `apply` renames retired tables to `eb_retired_*`, deletes retired settings, tabs,
  menus, timers and group data, carries the notification roster over and exports
  unreachable balances to CSV. `rollback` restores; `finalize` drops after the
  acceptance window. The install SQL carries none of the retired tables or seeds and
  now ships the presale menus and the notification setting.
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

# Maintenance implementation status

This record distinguishes changes in this working tree from the broader maintenance plan. Nothing here has been deployed.

| Batch | State | Evidence / remaining work |
| --- | --- | --- |
| P0 | Implemented | Architecture and tracked baseline inventory, PHP 7.4 syntax gate, regression, H5/MP-WEIXIN static checks, CI admin build and no-fix lint command. New checks run through `sh scripts/check-maintenance.sh`. |
| P1 | Implemented | The audit this row asked for is done and the shared legacy classes are gone: bargain, seckill, lottery, distribution, points, balance, commission and member surfaces were deleted from the backend, the admin and the install SQL rather than hidden. `tests/static/retired-code-guard.cjs` keeps their identifiers from coming back. |
| P2 | Implemented | Order presentation, dashboard statistics, coupon and freight-template calculation are extracted with public delegating methods; the legacy branches they carried went with the features. The group and presale paths now have executable coverage (`cases.md` SMOKE-010…012, REFUND-002…004, CORE-001). |
| P3 | Implemented | DIY registry contract and stale-component skip, cashier WeChat-only selection, three WeChat payment adapters. The v2/v3 selector the removal dropped by mistake is back (`pay_wechat_type`, GATEWAY-002). The admin still offers no authoring components for `newVip` or `presale`; persisted client components and links are retained, and on-device verification is still open. |
| P4 | Partially verified | Admin `dist/` output, the Node 20.19.0/npm 10.8.2 clean build, release manifest validation and the written rollout steps are done. The HBuilderX version, actual H5/MP-WEIXIN builds, a saved mini-program review package, real gateway payment/refund and a production-database migration rehearsal are still operator steps. |

Row state describes the current tree, not the state when each batch was proposed. Do not infer that a passing static check certifies a real uni-app build or that the checked-in `public` output is ready to deploy. The old activity pages remain in `pages.json` until their callers, deep links and archived-order behavior are resolved. `docs/maintenance/inventory.json` records the first confirmed deletion; the shared-class audit is finished and `docs/core-store-shared-retained.json` is emptied accordingly. The dated sections below are kept as history, including the rounds a later one corrected; the last section describes the current state.

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

Rollback restored table names and rows exactly in the no-drift rehearsal; the
second `apply` reported `Already migrated`. (Rollback is only exact while the
protected tables have not drifted and nothing was dropped: with drift it refuses
without `--force`, and after `finalize` it fails loudly instead of restoring.)
Remaining out-of-scope items in the local stack: the `/notice`
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

## Mobile app and residual flags (2026-09-18)

The last planned round covers the mobile (uni-app) surface and the backend flags
the earlier rounds left reading removed settings.

- **Write-off.** Self-pickup was already retired, but the mobile admin still
  shipped "订单核销" buttons on the order list and both detail pages, all posting
  to the deleted `order/order_verific` route, and the user-facing order detail
  still rendered a QR code pointing at the deleted `order_cancellation` page.
  Those, the two orphaned write-off components, and the API helpers behind them
  are gone. Historical self-pickup orders no longer render a blank status: the
  storefront list, the admin list and the CSV export all label them
  "历史自提订单".
- **Authorization.** `CustomerMiddleware` compared the request rule against a
  whitelist whose entries (`order_verific`, `admin/order/detail/<orderId>`)
  could never match the unprefixed rule, so removing it removes an
  authorization hole rather than a guard: the whitelist is deleted and the
  middleware checks the order-admin uid list alone.
- **Flags that inverted when their rows were deleted.** `ali_pay_status`
  returned `'' != '0'` — true — after its config row was removed, and the
  storefront turned that into "Alipay is available". The same held for the
  balance, offline-payment, self-pickup, level and member-card flags. They now
  answer "off" explicitly instead of reading a missing row.
- **`model_checkbox`.** The menu, DIY page-link and page-category DAOs, the
  storefront permission helper and the order-type statistic still defaulted to
  seckill/bargain/combination; only group-buying is retained, so the fallback is
  `['combination']`. The order-type statistic's `activity_type` searcher is
  restored — without it every bucket of the 订单类型 chart returned the same
  whole-table total.
- **Dead branches.** `NotifyListener`'s `attach === 'wechat'` message path, the
  mini-program handler's `hy`/`cz` attach prefixes and the payment components'
  all-in-one and Alipay branches have no producer since the transfer, recharge
  and Alipay drivers were deleted; the empty transaction around take-delivery
  and two unused parameters went with them. `crmeb/upgrade/VersionManager.php`
  was dead since `config/upgrade.php` was removed, and the maintenance lint now
  covers all of `crmeb/upgrade` rather than only `core-store`.
- **Pre-existing breakage fixed in passing.** The mobile admin's "agree refund"
  handlers imported `orderRefundAgree`, which no API module has ever exported,
  and posted nothing; they now use the same helper as the neighbouring
  branches. The build's remaining missing-export warnings were checked against
  `master` and are unchanged by this work.

**Verification.** The maintenance check passes (153 tests, 621 assertions, plus
the static gates). Both H5 and MP-WEIXIN build from source with Node 20.19.0 /
npm 10.8.2, and the build's missing-export warnings were diffed against a clean
`master` build: this work adds none. The two new regression cases were confirmed
to fail with the defect reintroduced (the flag test against a rebuilt image, the
statistic test against the working tree) and to pass once fixed. Not verified
here: on-device flows and a production gateway payment, which the release
checklist already lists as operator steps.

## Review fixes and coverage round (2026-09-19)

Phase five of the repair plan: executable coverage for the fixes the earlier
rounds landed, the documentation corrected against the code, and the last
retired remnants removed.

- **Storefront purchase coverage.** A new HTTP test walks cart → confirm →
  computed → create against production routes and asserts the order lands with
  stock decremented, `order/computed` returns the confirmation's price, order
  creation queues `UnpaidOrderCancelJob` (with the queue flag flipped on for the
  duration), the group-buy poster composes offline, and `/api/register` issues
  the newcomer coupon to the new uid only.
- **Double payment callback.** A real-row case pays one order through two
  notifications: the second is acknowledged, keeps the first trade number, and
  duplicates neither the pay-success status row nor the capital-flow row.
- **Roster by effect.** The order-notice roster test now drives the real
  notification listener and asserts the new-order in-site message reaches every
  listed administrator and nobody else, instead of restating the recipient
  array's shape.
- **Migration coverage.** The migration test seeds eight retired tables plus a
  timer, menu, permission row, dead personal-centre link, senderless
  notification template and custom event; asserts plan is read-only and
  reports them, apply removes exactly them while the retained timers and menus
  survive, rollback restores every shared table row-for-row, and the finalize
  dump list is derived from the fixtures. The plan report also gained the
  notification and event counters.
- **AllInPay remnants.** An install-SQL audit against the migration's retired
  lists found the AllInPay driver still on disk behind an unreachable branch,
  its settings tab and keys still seeded, six dead permission buttons under the
  retained user menu, ten notification templates with no sender left, and seven
  custom-event definitions of exited features. The driver, the branch and all
  of those seed rows are gone, the migration removes the same rows on existing
  shops, and the new `tests/static/install-sql-guard.cjs` (confirmed to fail on
  a reintroduced seed) keeps the install SQL and the migration lists in
  agreement. The stale route-registry rows are left deliberately: they are inert
  documentation pruned by the retained route sync.
- **Released image uploads.** The final image stage owned `public/uploads` by
  root while php-fpm runs as `www-data`, so every upload — including the
  regression poster case — failed with `mkdir(): Permission denied`. The image
  now chowns the directory and the deploy runbook documents the `chown` a host
  bind-mount needs.
- **Records corrected.** The apply order in `docs/core-store-reduction.md` and
  `crmeb/upgrade/core-store/README.md` now matches the code (create retained
  rows first, then remove, then rename); the install-SQL claims name exactly
  what is removed and the route-registry exception; `progress.md` no longer
  presents the emptied shared-class reference set as active or rollback as
  unconditionally exact; `tests/regression/cases.md` was rewritten against the
  current suite; and `docs/core-store-result.json` was regenerated with
  `node scripts/source-metrics.cjs --write`.

**Verification.** The maintenance check passes (160 tests, 715 assertions,
plus the static gates including the new install-SQL guard). The guards were
negative-tested: a reintroduced retired seed row fails the install-SQL guard
until reverted, and the new migration assertions fail against the pre-fix
script (they were observed failing before the image was rebuilt at the fixed
revision). Not verified here: on-device flows and a production gateway
payment, which the release checklist lists as operator steps.

## Retained-path audit (2026-09-19)

A review of the unpushed deletion batch against the paths it kept — the payment
selector, presale stock, the migration plan and the coupon entry points — found
eight defects the green gate could not see, because the guards match identifiers
and the suite had no fixture that used those paths. Only the settings defect came
in with the deletion; the presale and historical-order faults predate it. All
A ninth site surfaced while the coupon fix was being written: the DIY
`theme/coupon` component still listed the retired member rows. All of them are
fixed on this branch and each fix has a case in `tests/regression/cases.md`.

- **WeChat version selector.** `pay_wechat_type` sat in the migration's retired
  setting list and was gone from the install SQL, although `PayServices::pay()`,
  `StoreOrderRefundServices::agreeRefund()` and the notification handler read it
  to pick the v2 or v3 driver. A v3 shop fell back to v2 after the migration and a
  fresh install had no way to select v3. The setting is out of the retired list,
  back in the install SQL with the row the pre-cleanup schema shipped, and created
  with default `0` on a database that never had it (`GATEWAY-002`).
- **Presale stock.** `regressionStock()` branched on `combination_id` and
  otherwise restored ordinary product stock, so a presale order's presale row,
  presale SKU and product row were credited through the wrong service; it now
  dispatches on the layer the order sold from. Both refund paths also ignored the
  return value and could report success with the stock still deducted, and now
  throw `库存回退失败` before the payment gateway is reached (`REFUND-002`…`REFUND-004`).
- **Apply plan.** Three defects that lost settings without an error shared one
  cause: rules read the database as it was before the run instead of the state the
  run was about to produce. Added rows took `MAX(id) + 1` once per turn and handed
  the same id to two of them, which `recordChange()` merges; the roster merge read
  only the stored setting, so the one this run created kept an empty value and
  dropped the chat members it should have inherited; and the retired-setting
  cleanup judged the stored tab, so a retained setting the same run had just moved
  off a dead tab was deleted afterwards. Ids are now claimed once per row, every
  later rule reads the planned state, and a check before the backup is written
  refuses a duplicate id, a duplicate name or a retained setting left on a tab
  that will not exist (`MIG-008`…`MIG-010`).
- **Rollback and finalize.** `rollback` ran `RENAME TABLE` inside the transaction
  that restored the rows; the rename commits implicitly, so a conflict found
  afterwards left the names and part of the rows restored while the command
  reported a refusal, and the retry could fail again on the rows it had already
  fixed. Every row image is now classified before the first rename, the renames
  run outside any transaction, the rows go into a fresh one afterwards, and a DML
  failure says the names are back and the same backup can be re-run. `finalize`
  accepted a dump file that merely *named* every table — the old test asserted
  exactly that — so a file that could restore nothing authorised dropping tables
  that still held rows. It now counts every pending table's rows first and refuses
  the whole batch with exit code 2 when any is non-empty; `--yes` and `--dump`
  cannot bypass the check (`MIG-011`…`MIG-013`).
- **Member coupons.** The storefront queries still admitted `receive_type = 4` and
  `issueUserCoupon()` had lost its membership check, so any user could claim a
  member-exclusive coupon by id and consume its `remain_count`. The list, PC list,
  popup list, quantity counts and search now admit `receive_type = 1` only. A
  later pass over the same path found the DIY `theme/coupon` component was still
  offering the retired rows as well; it now excludes `receive_type = 4` for every
  audience and returns an empty list for a block saved as 会员用户. Claiming by id
  refuses the row with `该优惠券所属业务已下线` before any write; records already
  issued are left untouched (`COUPON-001`…`COUPON-003`).
- **Recorded, not fixed.** Seckill and bargain orders would still be restored
  through the ordinary product-stock path, and splitting a historical order still
  zeroes some integral and commission fields. Both need data these shops do not
  have, so this round leaves them alone rather than growing a compatibility layer
  for history that does not exist.

**Verification.** `sh scripts/check-maintenance.sh crmeb-test` passes on an image
built with `VCS_REF=$(git rev-parse HEAD)`: 179 tests, 837 assertions, the PHP 7.4
lint over `crmeb/{app,crmeb,route,upgrade}` and all nine static guards. The new
cases were red first: with the production fixes stashed, the four affected test
classes reported 39 tests, 166 assertions, 1 error and 15 failures. This is source
and behaviour verification only. No admin, H5 or mini-program bundle was rebuilt in
this round, and no real-device or live-merchant payment/refund acceptance was run;
those remain release steps.

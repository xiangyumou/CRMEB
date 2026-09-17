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

# Stream R6 — what H4 found: category coupons, the activity unit price, 立即成团's notice; storefront e2e isolation

**Worktree** `../CRMEB-wt/ws-r6` · **Branch** `rewrite/ws-r6-h4-findings` (cut by the orchestrator from `rewrite/integration` after H4 merged). Read `docs/rewrite/briefs/R-k2-findings.md` § "Common rules" — they apply unchanged (no push, no SSH, no real WeChat / SMS / Aliyun, commit per unit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, no sub-agents, status in `docs/rewrite/status/r6.md`). Then read `docs/rewrite/status/h4.md`, `docs/rewrite/cr/CR-1-h4.md`, `CR-2-h4.md`, `CR-3-h4.md`.

**Owns:** `next/packages/core/src/coupon/**`, `next/packages/contracts/src/{coupon,order}/**`, the order **read model** in `next/packages/core/src/order/**` (the list/detail reads and whatever the create path must persist for them), the group-buy **settle** path in `next/packages/core/src/groupbuy/**`, their routes and route tests, `template/uni-app/{api,utils,tests}/**` plus minimal page edits, `next/e2e/storefront/**`, one additive migration in `next/packages/db/**` **only if** CR-2-h4 cannot be done without one (bump `EXPECTED_MIGRATIONS` in `apps/web/src/server/health.ts`; `tests/static/next-migration-guard.cjs` must stay green).

**R5 is in flight in the same domains.** Stay out of: `groupbuy.order.ts` `afterCreate` (R5 adds the group lock there), `order.checkout.service.ts` `buildDraft` and `shipping.freight.port.ts` (R5 moves their config reads), `core/scripts/gen-config-groups.ts`, `order/order.stock.hooks.test.ts`, `apps/web/src/server/{handle,container}.ts`, `next/e2e/admin/**`, `next/guards/**`. If you must touch a file R5 also touches, keep the hunk minimal and name it in your merge notes.

## 1. CR-1-h4 — category-scoped coupons on 确认订单

**Fix 1:** `listApplicable` resolves each line's categories from `productId` itself (the server owns the catalogue; a client-sent category list is a client-controlled eligibility input). `categoryIds` on the body becomes optional and ignored — say so in the contract's description. Service + route tests: a 品类券 is usable for a cart in its category with `categoryIds` omitted, and not usable when the client *claims* a category the product is not in. Then the uni-app wrapper stops sending `categoryIds`, and the `it.fails` in `tests/mappers.misc.test.mjs` is deleted as the CR says. Add or extend a storefront journey that applies a 品类券 at checkout if it fits in the existing coupon journey.

## 2. CR-2-h4 — the order read model says what the shopper paid per unit

Prefer the fix that needs **no migration**. If `order_items` already stores enough to derive the activity unit price, do fix 2 (`unitPrice` = the price paid, `originalUnitPrice` = the catalogue price, as `orderItemExample` shows). Otherwise choose between fix 1 (persist the adjustments) and fix 2 with **one** additive migration, and write down why. Either way `orderListItem` and `orderDetail` agree, a 预售 / 拼团 order with a stacked coupon separates activity from coupon, and the uni-app `it.fails` (`tests/mappers.order.test.mjs` › `CR-2-h4 …`) flips as the CR describes. Extend `presale.spec.ts` with the stacked-coupon case if the fixture allows.

## 3. CR-3-h4 — 立即成团 records the success effect

Pressing 立即成团 must record the same `groupbuy.settle` effect the expiry path records, once. Flip the `it.fails` in `groupbuy/groupbuy.smoke.int.test.ts` to `it`. Re-run `groupbuy.concurrency.int.test.ts` shuffled (three seeds) to show nothing regressed.

## 4. The uni-app staff 售后 screen follows `allowStaffRefundReview`

R2 put staff 同意 / 拒绝 behind `order-staff.allowStaffRefundReview` (off by default). The uni-app staff refund screen still shows both buttons and gets a 403. Hide them when the switch is off, reading it from wherever the staff surface already learns its switches (look at how `allowStaffRepricing` reaches the app; if nothing carries it, CR the smallest contract addition to the orchestrator instead of inventing one). Mapper test.

## 5. The storefront e2e never drives a server it did not start

`next/e2e/storefront` has the problem the admin suite had: a default port plus reuse of a running server let one worktree's run drive a sibling's stack. Make reuse opt-in (`SHOP_E2E_REUSE=1`) and default the ports and stack file to values unique per checkout (e.g. derived from a hash of the repo path), matching whatever R5 does for `e2e/admin` (read `../CRMEB-wt/ws-r5/next/e2e/admin` for its shape if it has landed there; otherwise use the same env names). Document it in the suite's README.

## Done

From `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm turbo run test:int --force --concurrency=4`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`, `pnpm guards` (0 failures; pending only on R5), rebuild web then `pnpm --filter @shop/e2e-admin e2e` and `pnpm --filter @shop/e2e-storefront test` on private ports — all journeys green, none blocked. From `template/uni-app`: `npm test` (no `it.fails` left for CR-1/2-h4), `npm run build:h5`, `npm run build:mp-weixin` (no "export … was not found"). Final report: per unit the change, tests, commit; ledger text if any; the final commit hash and merge-time notes.

# I — storefront end-to-end: status

Branch `rewrite/ws-i-storefront-e2e`, worktree `../CRMEB-wt/ws-i`, brief
`docs/rewrite/briefs/I-storefront-e2e.md`. Merged `rewrite/integration` at `fa9c7c2d9` (H3 in).
Package `@shop/e2e-storefront` (`next/e2e/storefront/**`).

```sh
cd next
pnpm turbo run build --filter @shop/web     # rebuild web first; the suite serves whatever .next holds
pnpm --filter @shop/e2e-storefront test     # 13 passed, 15 skipped (fixme, each with its CR)
```

## Journey matrix

"green" means it passes on integration today. "fixme" means it is a `blockedBy('<CR>: …')` test
(`src/blocked.ts`): skipped by default and listed with the reason, with its full motion and
assertions kept. Every fixme was **run** with `SHOP_E2E_RUN_BLOCKED=1`. On integration each one
fails at exactly its stated cause. On a uni-app tree with the CR-4-i patches applied, every CR-4-i
fixme passes, which leaves only CR-2-h3, CR-3-i and CR-2-i.

| #   | journey                   | spec › test                                                                                       | status                      | CR                              |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------- |
| 1   | Home / category / product | `home-category-product` › the DIY home page renders every fixture component with no console error | green                       | — (known gaps: CR-4-i §3 §4 §5) |
| 1   |                           | › the category tab shows the seeded category                                                      | green                       |                                 |
| 1   |                           | › the micro page from prod-7.json renders its own components                                      | fixme                       | CR-4-i §6                       |
| 1   |                           | › the micro page from prod-8.json renders its own components                                      | fixme                       | CR-4-i §6                       |
| 1   |                           | › a multi-spec product shows its price range and both spec groups                                 | fixme                       | CR-2-h3                         |
| 1   |                           | › a fixed-postage product shows its own name and price                                            | fixme                       | CR-2-h3                         |
| 2   | Cart → checkout → pay     | `cart-checkout-pay` › quantity change in the cart, checkout to a freight-inclusive total (¥86.00) | green                       |                                 |
| 2   |                           | › pay an order at the cashier; the order is paid (¥45.00), 订单支付成功                           | green                       | (CR-5-i shim)                   |
| 2   |                           | › the confirm page itemises the freight it charges                                                | fixme                       | CR-4-i §9                       |
| 2   |                           | › apply a granted coupon on the confirm page                                                      | fixme                       | CR-4-i §11                      |
| 2   |                           | › submit the confirm page, pay, see 待发货                                                        | fixme                       | CR-4-i §10                      |
| 2   |                           | › add to cart from the product page; the cart agrees                                              | fixme                       | CR-2-h3                         |
| 3   | Ship → receive → review   | `ship-receive-review` › a shipped order shows courier and tracking number                         | green                       |                                 |
| 3   |                           | › review a received order line                                                                    | green                       |                                 |
| 3   |                           | › confirm receipt from the order page and review from there                                       | fixme                       | CR-4-i §7, §8                   |
| 4   | Refund                    | `refund` › apply, admin approves, the money moves (¥39.00, `succeeded`)                           | green                       |                                 |
| 4   |                           | › a refunded request is under 已退款 with the 已退款 stamp                                        | fixme                       | CR-4-i §12, §13                 |
| 4   |                           | › open the refund form from the order page                                                        | fixme                       | CR-4-i §7                       |
| 5   | Group buy                 | `groupbuy` › two shoppers complete a group-buy team                                               | fixme                       | CR-4-i §8, §10                  |
| 6   | Login                     | `login` › the terms checkbox blocks submission until checked                                      | green                       |                                 |
| 6   |                           | › password login reaches an authenticated screen (profile 200 with the token)                     | green                       |                                 |
| 6   |                           | › a 401 mid-session redirects to login exactly once                                               | green                       |                                 |
| 6   |                           | › an SMS code it can log in with                                                                  | fixme                       | CR-3-i (W5T)                    |
| 6   |                           | › a wrong SMS code is rejected and the code stays usable                                          | fixme                       | CR-3-i (W5T)                    |
| 7   | Presale                   | `presale` › presale price is what the order shows                                                 | fixme, **body not written** | CR-2-i (W5T)                    |
| 8   | Site config / share       | `site-config-share` › the public site config route answers, cached and versioned                  | green                       |                                 |
| 8   |                           | › the share panel opens with a poster action                                                      | green                       |                                 |
| 8   |                           | › the storefront shows the shop's own logo and copyright                                          | green                       |                                 |

Totals: 28 tests, 13 green, 15 fixme: 9 on CR-4-i, 3 on CR-2-h3, 2 on CR-3-i and 1 on CR-2-i.
A test blocked by two sections is counted once.

Where a journey's first half is blocked, the green test arranges that half through the real API
and drives the rest through the app. For example, the cashier test creates the order with
`POST /api/v1/orders` because 提交订单 is CR-4-i §10, and the review test confirms receipt through
the API because the order page is CR-4-i §7. The fixme twin keeps the all-in-app version.

**When W5T merges** (CR-2-i, CR-3-i): the two SMS tests should pass by deleting their `blockedBy`
line, because `scripts/serve.ts` already passes `SHOP_FAKE_SMS=1` to web. Journey 7's body still
has to be written against `presell_details`, which does not exist as a screen yet, so it is a
`throw` behind the fixme. The seed already has `presaleActivityId` / `activitySkuId`.

## CRs from this stream

| CR     | against                                                          | state                |
| ------ | ---------------------------------------------------------------- | -------------------- |
| CR-1-i | workflow owner: the `storefront-e2e` CI job YAML                 | open, apply at merge |
| CR-2-i | D2 / uni-app: `presell_details` unreachable                      | decided → W5T        |
| CR-3-i | E4 / web: fake SMS out of process                                | decided → W5T        |
| CR-4-i | uni-app mapper and page layer, §3 to §14, with validated patches | open, needs routing  |
| CR-5-i | `@shop/testing` fake gateway: H5 create answers no `h5_url`      | open, needs routing  |

Also consumed: CR-2-h3 (product page blank). This stream did not raise it.

## Stack start-up (`scripts/serve.ts`, Playwright `webServer`)

1. `pnpm gen` (turbo, cached).
2. PostgreSQL 17 and Redis 7 through `@shop/testing`'s Testcontainers global setup, and a
   database cloned from the migrated template.
3. The fake WeChat Pay gateway (`@shop/testing`), the control-plane bridge
   (`src/gateway-control.ts`: `complete-payment`, `/h5-cashier`), and the H5 pay shim
   (`src/h5-pay-shim.ts`, CR-5-i).
4. The seed (`src/seed.ts`), through `@shop/testing` factories and `ctx.config.set`:
   - site / payment / wechat config;
   - one category and two products (a multi-spec product, and a fixed-postage product whose
     freight template charges ¥6 + ¥2 per extra unit);
   - a 满减 coupon granted to the shopper;
   - group-buy and presale activities;
   - all six production DIY fixtures;
   - a 广东省/深圳市/南山区 division in `cities`, empty in the template DB;
   - a shopper with a default address, and a second shopper.
5. The H5 build (`npm run build:h5` in the uni-app tree), only when `dist/dev/h5` is older than
   the sources `pages.json` reaches (`src/h5.ts`).
6. `next build` only if `.next/BUILD_ID` is missing or `SHOP_E2E_BUILD=1`, then `next start` on
   :3221 with `SHOP_FAKE_SMS=1`.
7. The worker (`tsx src/main.ts`).
8. The edge on :3220 (`src/edge.ts`): static H5, plus `/api` and `/admin-api` proxied to web,
   same origin.
9. The handoff file `/tmp/shop-e2e-storefront.json`, which the specs read. It is left behind on
   exit and overwritten on the next start.

`reuseExistingServer` is on outside CI, so `pnpm --filter @shop/e2e-storefront serve` keeps a
stack warm between runs. `SHOP_E2E_UNIAPP_DIR=<abs path>` builds and serves another uni-app tree,
which is how a fixing stream proves a CR-4-i section:
`SHOP_E2E_UNIAPP_DIR=<fixed tree> SHOP_E2E_RUN_BLOCKED=1 pnpm --filter @shop/e2e-storefront test`.

## Time and memory

Measured on the dev box (32 cores / 32 GB, WSL2). **Emulated target: `taskset -c 0,1` plus a
systemd scope with `MemoryMax=3600M`, `MemorySwapMax=0`**, web and H5 prebuilt:

| run                                 | wall                          | result                | peak RSS, process tree | containers (PG + Redis) |
| ----------------------------------- | ----------------------------- | --------------------- | ---------------------- | ----------------------- |
| unconstrained, cold stack           | 43 s                          | 13 passed, 15 skipped | 2.79 GB                | ≈ 0.11 GB               |
| **2 cores, 3.6 GB cap**, cold stack | **50 s** (stack ready in 5 s) | 13 passed, 15 skipped | **2.98 GB**            | ≈ 0.10 GB               |

The process-tree figure sums RSS, so shared pages are counted more than once and it is an upper
bound. It includes Chromium, `next start`, the worker, Playwright, the edge and tsx. Under the cap
there was no OOM and no swap (swap was forbidden).

**Builds do not fit that envelope as-is.** The same constrained run with `SHOP_E2E_BUILD=1` built
the H5 bundle in 19 s and was then **OOM-killed in `next build`**. Next sizes its "Collecting page
data" pool from `os.cpus()` (31 workers here), and `taskset` does not change that. On a real
2-core host `os.cpus()` is 2, so this is an artefact of the emulation. Still, anyone building
`web` inside a small cgroup on a big machine (a CI runner with a memory limit, a container) will
hit it. The fix is `experimental.cpus` in `next.config.ts`, which web owns and this stream does
not. CI (CR-1-i) builds on a full `ubuntu-latest` runner, so it is unaffected.

## data-testid requests (for H3 / the uni-app owner)

None of these block anything today. Every locator works on text and structure (`src/uni.ts`
explains the uni-app H5 DOM). They are the places where a copy change or a restyle would break a
journey for no product reason. Requested as `data-testid` on the element named. In uni-app,
`data-*` on a `<view>` / `<button>` survives into the H5 DOM.

| page                               | element                                                 | suggested id                                                             | today's locator                                  |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| `order_addcart`                    | a cart row                                              | `cart-row` (+ `data-sku-id`)                                             | `.item` hasText product name                     |
| `order_addcart`                    | a row's + / − / quantity                                | `cart-qty-plus`, `cart-qty-minus`, `cart-qty`                            | `.carnum .plus`                                  |
| `order_addcart`                    | footer total and 立即下单                               | `cart-total`, `cart-checkout`                                            | `.footer` hasText 立即下单                       |
| `order_confirm`                    | address block                                           | `confirm-address`                                                        | `getByText('小明')`                              |
| `order_confirm`                    | 配送运费 / 优惠券 / 优惠券抵扣 rows                     | `confirm-freight`, `confirm-coupon`, `confirm-coupon-discount`           | `.item` / `.wrapper .item` hasText label         |
| `order_confirm`                    | 合计 and 提交订单                                       | `confirm-total`, `confirm-submit`                                        | `.footer` hasText 合计                           |
| coupon picker (`couponListWindow`) | each coupon                                             | `coupon-option` (+ `data-coupon-id`)                                     | `.coupon-list-window .coupon-list .item`         |
| `cashier`                          | pay-method row and 确认支付                             | `pay-method-weixin`, `pay-submit`                                        | `getByText('微信支付')`, button text             |
| `order_pay_status`                 | status headline and paid amount                         | `pay-status`, `pay-amount`                                               | `getByText('订单支付成功')`, `'45.00'`           |
| `order_details`                    | 确认收货 / 查看物流 / 申请退款 / 评价 buttons           | `order-receive`, `order-logistics`, `order-refund`, `order-review`       | button text                                      |
| `order_details`                    | status label                                            | `order-status`                                                           | `getByText('待发货')`                            |
| `goods_logistics`                  | courier name, tracking number                           | `logistics-company`, `logistics-no`                                      | `getByText('顺丰速运').first()`                  |
| `goods_comment_con`                | review textarea and 立即评价                            | `review-text`, `review-submit`                                           | `uni-textarea textarea`, button text             |
| `goods_return`                     | reason textarea and 申请退款                            | `refund-reason`, `refund-submit`                                         | same pattern                                     |
| `user_return_list`                 | tabs (全部/申请中/已退款)                               | `refund-tab-all`, `refund-tab-open`, `refund-tab-succeeded`              | tab text                                         |
| `user_return_list`                 | a row and its status stamp                              | `refund-row` (+ `data-refund-id`), `refund-stamp` (+ `data-refund-type`) | `.icon-yituikuan`                                |
| `goods_combination_details`        | 立即开团 / 单独购买 (page and the spec popup's confirm) | `groupbuy-open`, `groupbuy-solo`, `sku-popup-confirm`                    | button text                                      |
| `goods_combination_status`         | 参团 / 邀请好友                                         | `groupbuy-join`, `groupbuy-invite`                                       | button text                                      |
| `login`                            | phone, password, code inputs                            | `login-phone`, `login-password`, `login-code`                            | `uniInput(page, placeholder)`                    |
| `login`                            | 获取验证码, terms checkbox, 登录                        | `login-send-code`, `login-terms`, `login-submit`                         | `uni-button.code`, text                          |
| DIY renderer                       | each rendered component's root                          | `diy-<componentId>`                                                      | component-specific classes (`missingComponents`) |
| `user`                             | copyright image                                         | `site-copyright`                                                         | `img[src=…]`                                     |

## Known gaps (asserted-around, not ignored)

Journey 1 fails on any console error or failed request (≥ 400, or a network failure) **not** in
`next/e2e/storefront/src/known-gaps.ts`. Today that list is:

| pattern                                                               | owner     |
| --------------------------------------------------------------------- | --------- |
| `GET /api/get_script 404`                                             | CR-4-i §4 |
| `GET /statics/images/<file> 404`                                      | CR-4-i §5 |
| console `appendChild … Unexpected token '<'`                          | CR-4-i §4 |
| `unhandledrejection TypeError … reading 'length'` (首页 coupon popup) | CR-4-i §3 |

Every test attaches `console-errors.txt` and `failed-requests.txt` to its report entry, green or
not.

## Observations for other owners (not CRs from this stream)

- **Freight without a city is zero.** An address with no `cityId` is quoted ¥0 freight: the
  template's fallback region is skipped instead of applied. The seed now gives addresses a real
  division, which is why this passes. Production addresses migrated without a `city_id` would ship
  free. Worth a look by the freight/order owner.
- **Flaky web unit test.** `apps/web` `product-list.test.tsx` once failed the gate with
  `window is not defined` during teardown and passed on re-run. It is unrelated to this stream,
  but it will fail the merge gate now and then.
- **Root `pnpm test`.** This package's script is `test`. A root `turbo run test` would start the
  whole stack. The gate uses `test:unit`, so nothing runs it by accident today.

## Merge-time: the nine `SMOKE-*` ledger rows assigned to I

CR-2-k parked `SMOKE-002…009, 012` on stream I (`next/guards/src/lib/pending-edits.ts`, `assign`
with no `cr`). While `streams.ts` says `I: 'in-flight'` they print as `pending(I)`. **The moment
I is flipped to `merged` they fail `pnpm guards`** ("proposes stream I, which has merged").
`invariants.md` and `guards/**` are not this stream's to edit, so this is a proposal for the
orchestrator to apply at merge. Test ids use the guard's `file::leaf title` form, relative to
`next/`.

| row                                                                    | proposal                                                                                  | test / reason                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SMOKE-002 recommendation lists load                                    | map                                                                                       | `e2e/storefront/specs/home-category-product.spec.ts::the DIY home page renders every fixture component with no console error`                                                                                |
| SMOKE-003 `/api/index`, logged-in `/api/v2/index`                      | map, **Adapted:** the home is `GET /api/v1/diy/pages/home`, loaded by a signed-in shopper | same test                                                                                                                                                                                                    |
| SMOKE-004 `/api/userinfo` for the token holder                         | map, **Adapted:** `GET /api/v1/profile`                                                   | `e2e/storefront/specs/login.spec.ts::password login reaches an authenticated screen`                                                                                                                         |
| SMOKE-005 order-create records the status                              | map                                                                                       | `e2e/storefront/specs/cart-checkout-pay.spec.ts::a shopper pays an order at the cashier and the order is paid` (created `pending_payment` → `paid`, worker running)                                          |
| SMOKE-006 delete a finished order; not a shipped one; not a stranger's | not a journey here; candidate, **unverified**                                             | `packages/core/src/order/order.int.test.ts::answers a second tap, a stranger and an unknown id all with the same 404`. Check that it covers the shipped refusal before mapping, or assign to the order owner |
| SMOKE-007 retired payment flags report off                             | no candidate found                                                                        | an owner decision: `retire` if the rewrite has no such flags, or assign to the payment/config owner                                                                                                          |
| SMOKE-008 order-type statistic                                         | no candidate found; admin statistics, not storefront                                      | assign to the stats owner                                                                                                                                                                                    |
| SMOKE-009 group-buy poster offline                                     | candidate, **unverified**, **Adapted:** the poster is data, not an image                  | `packages/core/src/groupbuy/groupbuy.int.test.ts::answers the poster with data and a payload, never an image`                                                                                                |
| SMOKE-012 group success updates once                                   | candidate, **unverified**                                                                 | `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::completes the team once and only once`. The "no repeated notifications" half needs checking                                                    |

## Harness notes

- Payment is settled through the control plane (`payAtCashier`), which signs a real notification
  and posts it to the real webhook. The browser does not follow WeChat's page.
- The cashier result page can render before the webhook lands. The test reloads once the API
  shows `paid`, which is what a shopper coming back from WeChat gets.
- Warm-stack runs accumulate cart rows, so every cart journey starts with `emptyCart`.
- `pnpm --filter @shop/e2e-storefront test -- --reporter=line` passes flags through to
  Playwright. Without the `--`, pnpm takes `--reporter` for itself.

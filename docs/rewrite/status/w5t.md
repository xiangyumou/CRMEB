# W5T — wave-5 tail: status

Branch `rewrite/ws-w5t-wave5-tail`, cut from `rewrite/integration` at `fa9c7c2d9`.
Brief `docs/rewrite/briefs/W5T-wave5-tail.md`. Units done in the brief's order §2, §1, §3, §5, §4.

| unit | CR      | route / change                                           | commit      | state |
| ---- | ------- | -------------------------------------------------------- | ----------- | ----- |
| §2   | CR-2-h3 | `GET /api/v1/diy/pages/product-detail`                   | `5d6e181dd` | done  |
| §1   | CR-1-h3 | `GET /api/v1/staff/users/:uid/coupons`                   | `eef7affe3` | done  |
| §3   | CR-3-h3 | `GET /api/v1/site/config` gains `auth`                   | `8ec309fbf` | done  |
| §5   | CR-3-i  | `SHOP_FAKE_SMS=1` registers the fake SMS sender in `web` | `5d70ff5cf` | done  |
| §4   | CR-2-i  | `presell_details` registered, 预售列表 opens it          | `45b96d9a9` | done  |

## §2 — CR-2-h3: the product page's DIY design

**Route.** `GET /api/v1/diy/pages/product-detail` (`diy.productDetailPage`, `auth: 'public'`).

**As implemented.**

- The newest published `product_detail` page (`findLatestPublishedOfKind`, the same finder
  个人中心 uses), in the storefront envelope, retired components stripped by `cleanDiyData`.
  A draft is never served.
- None published → the **built-in default**, `PRODUCT_DETAIL_DEFAULT_VALUE`
  (`next/packages/contracts/src/diy/product-detail.default.{ts,json}`), with `id: null` and
  version `builtin-product-detail-1`. The response schema is `diyProductDetailPage` =
  `diyStorefrontPage` with a nullable `id`: the default has no row, and a made-up id would
  send a `pages/:id` caller to a page that does not exist. The route never 404s.
- The default is the legacy install's default detail page — `eb_theme.detail_default_data` of
  经典红 in `crmeb/public/install/crmeb.sql` — minus `home_paid_vip` (paid membership,
  retired) and `goodRecommend` (its default is 指定商品 with no products: a heading over
  nothing). Five components remain, keys and props verbatim: `productInfo`,
  `productService` (`homeProductService.vue`), `reviews` (`homeReviews.vue`), `productDesc`,
  `bottomMenu` (read by `productBottom.vue`). The brief named the Vue components; the DIY
  `name`s `pageDesign.vue` dispatches on are `productService` / `reviews`.
- The payload is a JSON data file, not a TS literal, because the `bottomMenu` 客服 entry
  carries the legacy iconfont glyph name that the `retired` guard's `kefu` word matches. It is
  a glyph, not the retired module — the guard's deny-list already records that reading for
  `apps/web/src/admin/diy/defaults/bottomMenu.default.ts`. If the orchestrator would rather
  have it as TS, the guard needs the same deny-list entry for
  `next/packages/contracts/src/diy/product-detail.default.ts`.
- Cached 60 s in Redis (`diy:product-detail:v1`), dropped by every 装修 write through the
  existing `invalidateDiyStorefrontCache`.
- uni-app: `getThemeInfo('detail')` (`template/uni-app/api/api.js`) reads it with
  `toLegacyDiyPage`; H3's empty-page stub is gone. The `theme_id` preview branch is unchanged.

**Tests.**

- `next/packages/contracts/src/diy/product-detail.default.test.ts` — the default passes
  `parseDiyPageValue` (returns the same object), every node its own component schema, the
  five names in render order, no `home_paid_vip`, no URL, fits the wire envelope.
- `next/packages/core/src/diy/diy.int.test.ts` 「商品详情 (CR-2-h3)」 — default when none
  published (verbatim, so `cleanDiyData` is a no-op on it); the default saves through the
  editor's own `savePageContent`; a draft is ignored and a published page wins; newest
  published wins, another kind never does, delete falls back; retired components stripped;
  cache + invalidation on publish.
- `next/apps/web/app/api/v1/diy/product-detail.int.test.ts` — the default without a
  session, then the published page, both through `VALIDATE_RESPONSES`, ETag set.
- `template/uni-app/tests/mappers.misc.test.mjs` — `toLegacyDiyPage` on the contract's
  default example (`id` 0, the five names, the `bottomMenu` fields `productBottom.vue`
  reads); `smoke.live.test.mjs` asserts `getThemeInfo('detail')` returns the page (384/384
  with `MOCK_URL`).
- Contract examples: `built-in default` (first, so the mock server serves a real product
  page) and `published`.

**Left for the orchestrator.**

- Legacy never kept the product page in `eb_diy` (the seed's `eb_diy` has no such row). It
  lives in `eb_theme.detail_data`, which the ETL `diy` group already maps to
  `themes.data.productDetail` — but nothing on the storefront reads that, and 恢复默认 pulls
  `defaultData.productDetail` first. A migrated shop that customised its product page
  therefore gets the built-in default until an operator rebuilds and publishes one. Fix, if
  wanted: an ETL step that turns the active theme's `data.productDetail` into a published
  `product_detail` page (`packages/etl`, not W5T). 个人中心 has the same shape
  (`eb_theme.user_data`).

**Storefront e2e fixmes unblocked.** Three `CR-2-h3` blockers (the product-page journeys) — see
「Storefront e2e blockers each unit lifts」 below.

## §1 — CR-1-h3: a 店员 reads one customer's coupons

**Route.** `GET /api/v1/staff/users/:uid/coupons` (`coupon.staffUserCoupons`, `auth: 'staff'`),
optional `?state=unused|used|expired`, answering `{ items: userCoupon[] }`.

**As implemented.**

- The item is the storefront 我的优惠券 `userCoupon` and the service maps with the wallet's own
  `toUserCoupon` + `templateTermsFor`, so the drawer and the customer's wallet cannot drift.
- No `state`: every coupon the customer holds, spendable (`unused` and not past `validTo`)
  first, newest first inside each half. With `state`: one wallet tab, filtered by the same
  predicate `GET /api/v1/user-coupons` uses — extracted from `listUserCoupons` into
  `walletStateFilter` in `coupon.repo.ts` rather than copied. At most 100 rows
  (`STAFF_USER_COUPON_LIMIT`); the drawer does not page.
- `404 USER_NOT_FOUND` for an unknown uid (as E4's `GET /api/v1/staff/users/:uid`); `422` for a
  state outside the enum. The service re-checks `actor.kind === 'staff'` and throws
  `FORBIDDEN`, so the route fails closed even if the `auth` were ever mis-declared.
- `couponCount` on E4's staff user detail: **not added**, `coupon_num` stays 「--」. The detail
  is the user domain's (`contracts/src/user`, `core/src/user`, outside W5T ownership), and a
  count there is a second query into the coupon domain's `user_coupons`, not one batched query
  on the rows the detail already reads. If wanted: a `UserCouponCountPort` in the user domain
  registered by coupon, the shape W4T used for `UserOrderStatsPort`.
- uni-app: `getUserCoupon({ uid })` (`template/uni-app/api/admin.js`) reads the route with the
  wallet mapper `toLegacyUserCouponList`; without a uid it is still B3's grantable list. The
  reject stub is gone.

**Tests.**

- `next/packages/core/src/coupon/coupon.int.test.ts` 「staffListUserCoupons — 查看优惠券
  (CR-1-h3)」 — spendable first then newest; each `state` tab; another customer's coupons never
  appear and an unknown uid is `USER_NOT_FOUND`; a user (self and other) and the system actor get
  `FORBIDDEN`.
- `next/apps/web/app/api/v1/coupons.staff.int.test.ts` 「GET /api/v1/staff/users/:uid/coupons」 —
  401 without a session, 403 for the customer asking about themselves; the staff answer equals
  the customer's own `/user-coupons` item; `?state=used` empty; 404 unknown uid; 422
  `state=all`.
- `template/uni-app/tests/mappers.misc.test.mjs` — the contract example through
  `toLegacyUserCouponList`; `smoke.live.test.mjs` — 查看优惠券 hits
  `/api/v1/staff/users/1001/coupons` and gets the spendable coupon first (385/385 with
  `MOCK_URL`). `check:routes`: 188 live, 0 pending.
- Contract examples: `spendable-first`, `unused-only`, `none`.

**Storefront e2e fixmes unblocked.** None names CR-1-h3 — see 「Storefront e2e blockers each unit lifts」 below.

## §3 — CR-3-h3: the login-method switches

**Route.** `GET /api/v1/site/config` (unchanged id and path) gains
`auth: { wechatOa, wechatMini, phone }`.

**As implemented.**

- `wechatOa` = 公众号 启用 (`wechat-oa.enabled`) and `wechat.oaAppId` and `wechat.oaAppSecret`;
  `wechatMini` = 启用小程序 (`wechat-mini.enabled`) and `wechat.miniAppId` and
  `wechat.miniAppSecret`. The brief said "app id and secret"; the switch is added because E1's
  `oaApp` / `miniApp` refuse without it (`AUTH_WECHAT_NOT_CONFIGURED`), and a flag that sends
  the shopper to a failing button is worse than one that hides it. It is exactly the rule
  `wechat.mini-code.service.ts` already uses for the mini program.
- `phone` = `smsSenderUsable`: a registered sender (tests, `SHOP_FAKE_SMS` from §5), or
  `smsProviderConfigured(config)` — `resolveSender`'s Aliyun rule, extracted into
  `sms.service.ts` and now called by `resolveSender` itself, so the two cannot drift. Tencent
  is declared but unimplemented and reads `false`, as `resolveSender` returns `nullSmsSender`
  for it. The verify-code template id is not part of the rule, as it is not part of
  `resolveSender`'s.
- **Inversion, like `payments.wechat`.** `system` exports `registerSiteAuthMethod(method,
{ groups, isEnabled })`; `wechat` and `sms` register probes from new explicit registrars
  `registerWechatDomain()` / `registerSmsDomain()`, which `pnpm gen` adds to `domains.gen.ts`
  (10 explicit registrars now). A first draft registered at import and failed in a unit test:
  `system` → … → `payment` → `wechat/index.ts` evaluates while `system` is half-initialised.
  `siteConfigSourceGroups()` now also lists `sms`, `wechat`, `wechat-oa`, so saving any of them
  drops the cached payload. Cache key `site:config:v1` → `v2` (a v1 payload lacks `auth` and
  would fail response validation for up to 60 s after deploy).
- **Out of ownership, flagged:** the probes need the `wechat` group, which only the `wechat`
  domain may read (`system` may not import it), so the registration lives in
  `next/packages/core/src/wechat/wechat.site-auth.ts` (new) and `wechat/index.ts` (the
  registrar + an export). No other file of that domain changed.
- uni-app `toLegacyBasicConfig`: `wechat_status: auth.wechatOa === true` (legacy answered a
  PHP bool), `wechat_auth_switch` / `phone_auth_switch: 1 | 0` (legacy `(int) in_array(…)`).
  A payload without `auth` maps to all off. The comment's wrong `CR-2-h3` reference is fixed.

**Tests.**

- `next/packages/core/src/sms/sms.test.ts` 「smsProviderConfigured」 — Aliyun complete → true;
  each of the three blank → false; `none`, empty, and a complete Tencent → false.
- `next/packages/core/src/system/system.int.test.ts` 「站点公开配置 — 登录方式 (CR-3-h3)」 — fresh
  install all false; 公众号: id without secret false, id+secret+启用 true, 启用 off false (and
  the `wechat` save drops the cache); 小程序: credentials without 启用 false, with it true,
  app id cleared false, independent of the 公众号 credentials; phone: half an Aliyun config
  false, complete true, `none` false; a registered fake sender true; with everything
  configured the serialised payload contains none of the app ids, secrets or the SMS key id
  (the app ids and key id are not `secret: true`, so the registry-wide property test did not
  cover them). The source-groups test lists the six groups.
- Contract examples: `ok` all true, `nothing-filled-in` all false.
- `template/uni-app/tests/mappers.misc.test.mjs` 「the three login-method switches…」 — the
  example, all-off, each flag independent, and a payload without `auth`. `npm test` 354 passed;
  386/386 with `MOCK_URL`.

**Storefront e2e fixmes unblocked.** None names CR-3-h3 — see 「Storefront e2e blockers each unit lifts」 below.

## §5 — CR-3-i: fake SMS for an out-of-process server

> **For stream I (relay):** the variable is **`SHOP_FAKE_SMS=1`** — the name I's
> `next/e2e/storefront/scripts/serve.ts` already sets. With it, `POST /api/v1/auth/sms-codes`
> answers 202 and the code is the `code` field of the Redis hash
> `sms:code:<scene>:<phone>` (`codeKey()` from `@shop/core/sms`), e.g.
> `HGET sms:code:login:13800138000 code`. The resend guard is `sms:resend:<scene>:<phone>`;
> the per-phone budgets (5/hour, 20/day by default) still apply, so a suite that sends many
> codes to one number should vary the number or flush between runs.

**Change.** No route. `next/apps/web/src/server/env.ts` gains `SHOP_FAKE_SMS`
(`'' | '0' | '1'`, optional; any other value refuses to boot). `container.ts`'s
`buildContainer()` calls the new `applyProcessOverrides(env, logger)`: on `'1'`,
`registerSmsSender(fakeSmsSender())` and one `warn` per process, "fake SMS sender active — codes
are not delivered". No `fake` value in the `sms` config group. The comments in
`core/src/sms/sms.port.ts` / `sms.fake.ts` that said only tests register the fake now name
this caller.

**Module instances** (the reason CR-3-i was filed: a `NODE_OPTIONS=--import` preload got its
own copy of `@shop/core/sms`). In the Turbopack production build every route chunk carrying
the SMS code carries it under the same module id (checked in `.next/server/chunks`: 34 chunks,
one id), and the runtime's module cache is per process, so the container's registration and
every route handler share one `override`. `getContainer()` builds on the first request of any
route, so the order the app hits routes in does not matter. The web int test runs unbundled;
the bundled proof is I's `login.spec.ts` once the fixmes are lifted.

**Tests.**

- `next/apps/web/src/server/env.test.ts` (new) — unset is off; `'1'`, `'0'`, `''` parse;
  `true` / `yes` / `on` / `' 1'` / `2` refuse and `loadEnv` names the variable; **no file under
  `deploy/next/**` or `next/docker/**` mentions `SHOP_FAKE_SMS`** (with a check that the walk
  really found `compose.yml`, `deployment.env.example` and `web.Dockerfile`). There were no env
  tests in `apps/web` before; this is the file for them.
- `next/apps/web/src/server/container.test.ts` (new) — `'1'` registers the `fake` sender and
  warns exactly once across two builds; unset / `''` / `'0'` register nothing and stay quiet.
- `next/apps/web/src/server/fake-sms.int.test.ts` (new) — the real `buildContainer()` against
  the harness's PostgreSQL and Redis: without the flag `POST /api/v1/auth/sms-codes` is
  `502 AUTH_SMS_SEND_FAILED` and nothing is stored; with it, `202`, `HGET
sms:code:login:<phone> code` is six digits with a TTL, and `POST /api/v1/auth/sessions/sms`
  with that code is `201` with a token.

**Storefront e2e fixmes unblocked.** The two `login.spec.ts` SMS journeys — see 「Storefront e2e blockers each unit lifts」 below.

## §4 — CR-2-i: the presale purchase page is reachable

**Change.** No route: every call the page makes already had one.

- `template/uni-app/pages.json` — `presell_details/index` in the `pages/activity` subpackage,
  `navigationStyle: custom` (its own header, like 拼团详情; the legacy entry was the same).
- `template/uni-app/pages/activity/presell/index.vue` — `goDetails(item)` →
  `/pages/activity/presell_details/index?id=<activity id>` instead of `goods_details`.
- The detail page's calls, each a bound `api/*.js` function on a live contract route:
  `getPresellProductDetail` → `GET /api/v1/presale/activities/:id` (D2); 立即购买
  `postCartAdd({ advanceId, … , new: 1 })` → ticket `buynow:<sku>:<qty>:presale:<activity>` →
  `order_confirm`'s `POST /api/v1/checkout/preview` and `POST /api/v1/orders` with
  `kind: 'presale', kindMeta: { activityId }, source: 'buy-now'`; 收藏, 优惠券, 购物车数量,
  个人信息, 小程序码, 海报图片 on their own routes. No CR needed.
- **One line in `presell_details/index.vue` beyond the brief's two files:** the template at
  line 37 had a legacy syntax error (``$t(`已预订`)':' + …``, a missing `+`) that nobody saw
  because an unregistered page is never compiled; registered, it broke `build:h5`. Fixed to
  ``$t(`已预订`) + ':' + …``. No other line of the page changed.
- Not changed, noted: the poster's 小程序码 (`getProductCode(product_id)`) encodes the plain
  product page, as it did in legacy; the mini-code route also accepts
  `pages/activity/presell_details/index`, so pointing the poster at the presale page is a
  one-line follow-up if wanted. 定金预售 stays unsupported (D2), so the 尾款 branch never renders.

**Tests.** `template/uni-app/tests/presale.pages.test.mjs` (new, 6 tests): the registration and
its style; `goDetails()` targets `presell_details` with `item.id`; every named `@/api/*` import
of the page is a function on that module; `getPresellProductDetail` hits
`/api/v1/presale/activities/<id>` and yields what `getGoodsDetails()` reads; 立即购买 makes no
request, and the confirm page's preview and create both carry `kind: 'presale'` with the activity
id; the other seven calls each land on a contract route (a fake `uni.request` that answers
from the contract examples and 404s anything else). `npm test` 360 passed / 32 skipped;
`build:h5` and `build:mp-weixin` compile clean, no "export … was not found".

**Storefront e2e fixmes unblocked.** `presale.spec.ts` — see below. Note it is not only a
`fixme`: its body is `throw new Error('journey 7 is not written yet …')`, so stream I writes the
journey against `presell_details` before lifting it.

## Storefront e2e blockers each unit lifts

Read off `rewrite/ws-i-storefront-e2e` at `74191e2e6`, where I's blocked journeys call
`blockedBy('<CR>: …')` (a `test.fixme` unless `SHOP_E2E_RUN_BLOCKED=1`). On that branch the
earlier bare `test.fixme(… (CR-3-i))` / `(CR-2-i)` lines have become these calls.

| unit | CR      | spec : line                         | test                                                                                         |
| ---- | ------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| §2   | CR-2-h3 | `cart-checkout-pay.spec.ts:195`     | a shopper adds a product to the cart from its page and the cart agrees                       |
| §2   | CR-2-h3 | `home-category-product.spec.ts:99`  | a multi-spec product shows its price range and both spec groups                              |
| §2   | CR-2-h3 | `home-category-product.spec.ts:119` | a fixed-postage product shows its own name and price, not the freight product                |
| §1   | CR-1-h3 | —                                   | none                                                                                         |
| §3   | CR-3-h3 | —                                   | none                                                                                         |
| §5   | CR-3-i  | `login.spec.ts:81`                  | a phone number receives an SMS code it can log in with                                       |
| §5   | CR-3-i  | `login.spec.ts:105`                 | a wrong SMS code is rejected and the code stays usable                                       |
| §4   | CR-2-i  | `presale.spec.ts:23`                | presale price is what the order shows, not the catalogue price (journey body still to write) |

The product-page journeys need no seed for §2: with no published `product_detail` page the
route answers the built-in default, which is what a fresh shop shows. Not lifted by W5T: the `CR-4-i` blockers
(`cart-checkout-pay.spec.ts:122/136/160`, `home-category-product.spec.ts:80`, `refund.spec.ts`,
`ship-receive-review.spec.ts`, `groupbuy.spec.ts`).

## Definition of Done — final run (on `45b96d9a9`)

From `next/`:

- `pnpm turbo run gen typecheck lint test:unit build` — 33/33 tasks
- `pnpm --filter @shop/core test:int` — 55 files, 1147 tests
- `pnpm --filter @shop/web test:int` — 19 files, 238 tests (the three new files
  `coupons.staff`, `diy/product-detail`, `server/fake-sms` re-run verbosely: 16/16)
- `pnpm exec prettier --check .` — clean
- `pnpm --filter @shop/contracts check:examples` — 428 routes
- `pnpm guards` — 10 checks, 0 failures; no guard list change needed

From `template/uni-app`:

- `npm test` — 14 files passed, 1 skipped; 360 tests passed, 32 skipped
- `npm run build:h5`, `npm run build:mp-weixin` — both exit 0, no
  "export … was not found"

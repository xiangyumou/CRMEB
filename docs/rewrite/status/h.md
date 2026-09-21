# H — the uni-app storefront API layer

Branch `rewrite/ws-h-uniapp`, worktree `../CRMEB-wt/ws-h`. Nothing pushed.

Brief: `docs/rewrite/briefs/H-uniapp-api.md`. Scope: `template/uni-app/api/**`,
`utils/request.js`, `config/app.js`, `libs/`, plus the minimal call-site edits
the re-pointing forces. Pages and components are **not** rewritten.

## Where it stands

```
$ npm run check:routes
189 calls: 85 live, 104 pending, 0 broken
$ npm test
Test Files  9 passed | 1 skipped (10)   Tests  229 passed | 8 skipped (237)
$ MOCK_URL=http://127.0.0.1:4010 npm test     # with the contract mock running
Test Files  10 passed (10)              Tests  237 passed (237)
$ npm run build:h5          → dist/dev/h5        DONE
$ npm run build:mp-weixin   → dist/dev/mp-weixin DONE
```

Every `request.*` call in `api/*.js` is either a literal path that exists in
`next/packages/contracts/openapi.json` or carries a `CONTRACT-PENDING(<stream>)`
marker. The guard fails both ways: an unknown route **and** a marker left over a
route that has since landed, so the table below cannot rot.

| Module          | live | pending | note                                                       |
| --------------- | ---: | ------: | ---------------------------------------------------------- |
| `api/order.js`  |   38 |       2 | cart, checkout, orders, 收货, 包裹, 发票, 售后              |
| `api/store.js`  |   18 |       2 | catalog, 评价, 收藏, 足迹                                   |
| `api/admin.js`  |   21 |      22 | 商家管理; the 22 belong to A / E1 / B1 / F2, not B2         |
| `api/api.js`    |    4 |      20 | the grab-bag module                                         |
| `api/public.js` |    2 |      15 | 微信 / 站点配置                                             |
| `api/user.js`   |    2 |      36 | 用户中心; E1 owns almost all of it                          |
| `api/activity.js` |  0 |       9 | 拼团 / 预售 (stream D)                                      |

### What is still CONTRACT-PENDING, by stream

| Stream | n  | What                                                                     |
| ------ | -: | ------------------------------------------------------------------------ |
| E1     | 42 | 登录/注册/短信, `me`, 地址簿, and the staff 用户管理 screens              |
| E2     | 14 | 微信 JS-SDK, 授权, 订阅消息, 小程序码, 站内信                             |
| D      | 11 | 拼团 (`/groupbuys`, `/groupbuy-teams`) and 预售 (`/presales`)             |
| F2     | 10 | 文章, 地区, plus 电子面单 / 配送员 (CR-4-h §4, §5)                        |
| A      | 10 | the staff 商品管理 screens — B2's contract assigns them to A              |
| F1     |  8 | 站点配置, logo, 分享, 图片转 base64                                       |
| B1     |  4 | 删除订单 (CR-4-h §6), 订单赠券, staff 赠送优惠券                          |
| B2     |  3 | 统计明细 ×2 (CR-4-h §1), 售后备注 (CR-4-h §2)                             |
| G1     |  2 | DIY 页面布局 and 导航                                                     |

Each marker names the stream and sits above the call; `node
scripts/check-api-routes.mjs --json` prints the full list with file and line.

## The shape of the layer

```
utils/request.js        → the client: JSON, Bearer, real statuses, 401 single-flight
api/*.js                → one function per legacy export, URL + mapper, nothing else
api/mappers/<domain>.js → pure DTO → legacy view model (and fromLegacy* for bodies)
tests/*.test.mjs        → plain Node + Vitest, fixtures are the contracts' own examples
tests/smoke.live.test.mjs → the same functions over real HTTP; skipped unless MOCK_URL is set
scripts/check-api-routes.mjs → the guard
scripts/extract-page-fields.mjs → what every page reads off every api function
scripts/dump-contract-examples.mjs → regenerates tests/fixtures/contract-examples.json
```

**The resolved value is still the old envelope.** `request.js` resolves
`{data, msg, status: 200}` and rejects with an object that carries both
`message` and its alias `msg`, because 71 call sites toast `res.msg` and pages
toast `err` or `err.msg`. The new API says "it worked" with the status line, so
an `api/*.js` function that needs a toast supplies the text itself through
`opt.msg`.

**Mappers are pure.** No `Date.now()`, no store access, no locale lookups —
that is what lets `tests/` run them under plain Node with no uni runtime. The
one place that reads a clock is `unixSeconds`, and it reads the payload's own
instant.

**Retired features are collapsed at the mapper, not in the pages.** The flags
below are pinned to falsy constants so the page branch that renders them is
dead without the page being edited:

| Flag | pinned to | hides |
| ---- | --------- | ----- |
| `is_vip`, `vip_price`, `svip_price_open`, `levelPrice`, `memberPrice` | `0` / `false` | 会员价 / 付费会员 |
| `yue_pay_status`, `yue_price`, `now_money` | `0` | 余额支付与充值 |
| `store_self_mention`, `shipping_type: 0` (storefront) | `0` | 门店自提与核销 |
| `is_gift`, `gift_price`, `gift_uid`, `pay_uid` | `0` | 赠品 / 送礼 / 好友代付 |
| `seckill_id`, `bargain_id`, `combination_id`, `pink_id`, `advance_id` | `0` | 秒杀 / 砍价 / 拼团 / 预售 entry points |
| `use_integral`, `deduction_price`, `integral_count` | `0` | 积分抵扣与签到 |
| `is_invoice` on an order | from the invoice's own status | — (invoices are live) |
| `split` | `[]` | 拆单发货 |
| `product_type`, `virtual_type` | `0` unless the product says otherwise | 虚拟商品的旧分支 |

## Decisions other streams must know

- **`order_id` is the surrogate id, not the order number.** Pages both print
  and route on it, and only the surrogate is routable — CR-1-h asks B1 to take
  either. `order_no` and `trade_no` carry the real number.
- **Buy-now has no hidden cart row.** `order_confirm` receives a synthetic
  ticket `buynow:<skuId>:<qty>`; `parseBuyNowTicket` turns it back into the
  checkout body. Legacy created a cart row with `is_new: 1` and relied on the
  order creation to delete it.
- **`unique` carries the SKU id, not the SKU code**, everywhere a page hands a
  spec back to the API, so `POST /api/v1/cart/items {skuId}` round-trips.
- **发票抬头 is device-local.** B2 did not port the address book and said the
  storefront should remember the last header itself; `libs/invoiceTitles.js` is
  that memory, and `makeUpinvoice` freezes the chosen header onto
  `POST /api/v1/orders/:id/invoice`. Nothing about it is authoritative.
- **物流 is composed client-side.** An order has a `shipments` collection and
  the trace feed hangs off a shipment, so `express()` reads the order, its
  parcels and the tracking of the parcel it will show, and hands the page the
  old `{order, express: {result: {list}}}` payload. A parcel whose tracking
  call fails is still rendered, without a timeline.
- **改价 posts a discount.** The staff pages now send the current `pay_price`
  next to the typed total and `fromLegacyPriceInput` computes the difference,
  because B2's `orderPriceBody` deliberately has no "set the total" field.
- **The staff console's `_status` is an integer in the list and an object in
  the detail.** That is how the legacy payloads were; `api/mappers/staff.js`
  documents the scale.
- **Uploads go to `POST /api/v1/uploads?purpose=…` with the multipart field
  named `file`.** The contract does not name the field — CR-5-h.

## Ownership extensions

The brief scoped this stream to `api/**`, `utils/request.js`, `config/app.js`
and `libs/`. Two directories were added under `template/uni-app/` and are H's:

- `scripts/` — `check-api-routes.mjs` (the guard), `extract-page-fields.mjs`
  (the field report, output committed under `scripts/reports/`),
  `dump-contract-examples.mjs` (regenerates the test fixtures from
  `next/packages/contracts/src/routes.gen.ts`).
- `tests/` — Vitest specs and `tests/fixtures/contract-examples.json`.

Also H's by necessity: `libs/invoiceTitles.js` (new).

## Deleted

Modules: `api/kefu.js`, `api/lottery.js`, `libs/chat.js`, `libs/new_chat.js`,
`config/socket.js`.

Pages and components: `components/update/`,
`pages/activity/goods_bargain_details/`, `pages/activity/goods_seckill_details/`,
`pages/goods/receive_gift/`, `pages/goods/receive_gifts_status/`,
`pages/users/payment_on_behalf/`, `pages/annex/settled/`,
`pages/users/scan_login/`, `pages/columnGoods/HotNewGoods/feedback.vue`,
`pages/goods/order_pay_status/payLottery.vue`,
`pages/goods/order_pay_status/components/giftModal.vue`,
`pages/admin/refund/index.vue`, `pages/admin/components/splitOrder/`, and the
matching routes in `pages.json`.

Exports: the 83 the field report found unreferenced, plus `setOfflinePay`,
`orderSplitInfo`, `orderSplitDelivery` (B2's contract records that the last two
never had a route at all), `getInvoiceLink`, `spread`, `appleLogin`.

### Call sites edited (the minimum the re-pointing forced)

| File | Why |
| ---- | --- |
| `pages/goods/order_confirm/index.vue` | 门店自提 / 送礼 branches removed; `checkShipping` collapsed to express-only |
| `pages/goods/order_details/index.vue` | gift-order imports and `receiveGift` removed |
| `pages/goods/goods_return*/`, `order_refund_goods/` | upload calls pass `{purpose: 'refund'}` |
| `pages/users/user_info/`, `eidtUserModal` | upload calls pass `{purpose: 'avatar'}` |
| `pages/admin/delivery/index.vue` | 拆单 removed; the 发货 form also sends `delivery_company_id` |
| `pages/admin/{orderList,orderDetail,refund_order_list,refund_order_detail}` | 线下付款 removed; 改价 also sends `pay_price` |
| `pages/users/user_invoice_list/index.vue` | 复制 copies the invoice number; the row links by invoice id; the goods thumbnail is guarded |
| `pages/users/login/index.vue`, `utils/index.js`, `App.vue`, `libs/{wechat,routine}.js` | imports of retired exports |
| `subpackage/diyComponents/{tabNav,homeComb}.vue` | `getCategoryVersion` was imported from the wrong module — a pre-existing break |

## Known dangling imports (all predate this stream)

Both builds finish clean apart from eight `export … was not found` warnings.
Every one of them is broken on `master` too — checked import by import against
`git show master:<file>` — and none is an api function this stream re-pointed:

| Import | From | Why it stays |
| ------ | ---- | ------------ |
| `postAddress` | `pages/users/user_address_list` | never existed; the page's other calls work |
| `newcomerList` | `subpackage/diyComponents/newVip.vue` | 新人专享 is retired |
| `getAdvancellList` | `subpackage/diyComponents/presale.vue` | 预售 is stream D's, not yet contracted |
| `VUE_APP_API_URL` | `pages/users/login/index.vue` ← `@/utils` | `utils/index.js` exports `VUE_APP_WS_URL`, never this |
| `required`, `alpha_num`, `chs_phone`, `attrs` | same page ← `@/utils/validate` | a validation kit that was never committed |
| `handleError` | `pages/admin/goods/components/label/index.vue` ← `vue` | Vue 2 has no such named export |

Fixing them means editing pages, which this stream may not do; they are listed
so whoever owns those screens (E1 for 登录, A for 商品管理) picks them up.

## Change requests

| CR | Against | About |
| -- | ------- | ----- |
| [CR-1-h](../cr/CR-1-h.md) | B1 | `GET /api/v1/orders/:id` should accept an order number |
| [CR-2-h](../cr/CR-2-h.md) | B1 | change a cart row's SKU, decrement by SKU, batch favourite |
| [CR-3-h](../cr/CR-3-h.md) | A  | a cheap "has the category tree changed?" |
| [CR-4-h](../cr/CR-4-h.md) | B2, C | seven gaps left in the mobile staff console |
| [CR-5-h](../cr/CR-5-h.md) | F1 | the upload's multipart field name, and a purpose for staff uploads |

## How to run any of it

```bash
cd template/uni-app
npm ci                      # only the builds need it; the tests and scripts do not

npm run check:routes        # the guard; `node scripts/check-api-routes.mjs --json` for the table
npm run report:fields       # rewrites scripts/reports/page-fields.{json,md}
npm run fixtures            # after a contract changes, before the tests
npm test                    # vitest, borrowed from next/packages/contracts

# the same api functions over real HTTP, against the contract mock:
(cd ../../next/packages/testing && pnpm mock) &   # http://127.0.0.1:4010
MOCK_URL=http://127.0.0.1:4010 npm test

npm run build:h5
npm run build:mp-weixin
```

`dump-contract-examples.mjs` reads `next/packages/contracts/src/routes.gen.ts`,
not `openapi.json`: the OpenAPI writer drops `examples`, and the examples are
the whole point of the fixtures.

Two things about the build scripts, both fixed here because nothing built
before: this project keeps its sources at the package root rather than in
`src/`, so the scripts now pass `UNI_INPUT_DIR=.`; and Node ≥ 22 removed
`util.isRegExp`, which `postcss-urlrewrite` calls while the mp-weixin config is
validated, so they `--require ./scripts/node-compat.cjs`. Output lands in
`dist/dev/<platform>/` and is gitignored.

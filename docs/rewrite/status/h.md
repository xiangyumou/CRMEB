# H — the uni-app storefront API layer

Branch `rewrite/ws-h2-uniapp`, worktree `../CRMEB-wt/ws-h2`, rebased onto
`rewrite/integration` after stream S. Nothing pushed.

Briefs: `docs/rewrite/briefs/H-uniapp-api.md` (first pass),
`docs/rewrite/briefs/H2-uniapp-second-pass.md` (this one). Scope:
`template/uni-app/api/**`, `utils/request.js`, `config/app.js`, `libs/`,
`tests/`, `scripts/`, plus the minimal call-site edits the re-pointing forces.
Pages and components are **not** rewritten.

## Where it stands

```
$ npm run check:routes
191 calls: 154 live, 37 pending, 0 broken
$ npm test
Test Files  13 passed | 1 skipped (14)   Tests  306 passed | 13 skipped (319)
$ MOCK_URL=http://127.0.0.1:4013 npm test     # with the contract mock running
Test Files  14 passed (14)                Tests  314 passed (314)
$ npm run build:h5          → dist/dev/h5        DONE
$ npm run build:mp-weixin   → dist/dev/mp-weixin DONE
```

The first pass left `189 calls: 85 live, 104 pending`. E1, E2, D, F2 and S have
landed since; what is left is 37 calls against routes nobody has written.

Every `request.*` call in `api/*.js` is either a literal path that exists in
`next/packages/contracts/openapi.json` or carries a `CONTRACT-PENDING(<stream>)`
marker. The guard fails three ways — an unknown route, a marker left over a
route that has since landed, and a URL it cannot read at all — so the table
below cannot rot.

| Module            | live | pending | note                                                  |
| ----------------- | ---: | ------: | ----------------------------------------------------- |
| `api/order.js`    |   41 |       1 | cart, checkout, orders, 收货, 包裹, 发票, 售后        |
| `api/admin.js`    |   18 |      18 | 商家管理; the 18 are A (10), E1 (6), B1 (2)           |
| `api/user.js`     |   30 |       4 | 用户中心, 地址簿, 登录注册, 站内信                     |
| `api/api.js`      |   27 |       6 | the grab-bag module                                    |
| `api/store.js`    |   20 |       1 | catalog, 评价, 收藏, 足迹                              |
| `api/activity.js` |   10 |       2 | 拼团 / 预售                                            |
| `api/public.js`   |    7 |       5 | 微信身份 / 站点配置                                    |
| `utils/util.js`   |    1 |       0 | the upload, asserted by hand — it is not a `request.*` |

### What is still CONTRACT-PENDING, by stream

Every one of the 37 has a change request against the stream that owns it. None
is waiting on H.

| Stream | n  | What | CR |
| ------ | -: | ---- | -- |
| A  | 10 | the staff 商品管理 screens (`pages/admin/goods/**`)        | [CR-4-h2](../cr/CR-4-h2.md) |
| E1 |  9 | 行为验证码 ×2, 小程序一键绑定手机号, staff 用户管理 ×6      | [CR-2-h2](../cr/CR-2-h2.md) |
| F1 |  8 | 站点公开配置 ×6, 图片转 base64 ×2                          | [CR-7-h2](../cr/CR-7-h2.md) |
| E2 |  3 | 小程序码 for the three poster screens                      | [CR-6-h2](../cr/CR-6-h2.md) |
| G1 |  3 | 个人中心菜单, 底部导航, 分类/个人中心 版式开关              | [CR-3-h2](../cr/CR-3-h2.md) |
| B1 |  3 | 下单送券, staff 赠送优惠券 ×2                              | [CR-5-h2](../cr/CR-5-h2.md) |
| D  |  1 | 全店拼团人气条 (`avatars` + `pink_count`)                   | [CR-1-h2](../cr/CR-1-h2.md) |

`node scripts/check-api-routes.mjs --json` prints the list with file and line.

**The two that block a whole surface**, if anyone is choosing what to write
next: the behaviour captcha (CR-2-h2 §1 — without it *no SMS code can be sent
on any screen*, so 手机号登录, 注册, 找回密码 and 绑定/更换手机号 are all dead), and
F1's site config (CR-7-h2 — the app runs unbranded, with a 客服 button that
goes nowhere).

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
that is what lets `tests/` run them under plain Node with no uni runtime.

**A legacy call may fan out to several routes.** Nine do now
(`express`, `adminExpress`, `getCombinationDetail`, `getCombinationPink`,
`getUserInfo`, `getTempIds`, `collectAll`, `postCartNum`, `getStatisticsTime`).
The rule they all follow: the read the screen is *about* may fail loudly, and
everything decorating it is `.catch`-ed to an empty value. A 拼团 detail whose
team list 500s still renders the product.

**Every URL sits at a `request.*` call as a literal.** `expressView` takes three
thunks rather than three path fragments for exactly this reason — see the guard,
below.

**Retired features are collapsed at the mapper, not in the pages.** The flags
below are pinned to falsy constants so the page branch that renders them is
dead without the page being edited:

| Flag | pinned to | hides |
| ---- | --------- | ----- |
| `is_vip`, `vip_price`, `svip_price_open`, `levelPrice`, `memberPrice` | `0` / `false` | 会员价 / 付费会员 |
| `yue_pay_status`, `yue_price`, `now_money` | `0` | 余额支付与充值 |
| `store_self_mention`, `shipping_type: 0` (storefront) | `0` | 门店自提与核销 |
| `is_gift`, `gift_price`, `gift_uid`, `pay_uid` | `0` | 赠品 / 送礼 / 好友代付 |
| `seckill_id`, `bargain_id` | `0` | 秒杀 / 砍价 |
| `use_integral`, `deduction_price`, `integral_count` | `0` | 积分抵扣与签到 |
| `spread_uid`, `brokerage_price`, `is_promoter` | `0` | 分销 |
| `switchUserInfo` | `[]` | 多账号切换 |
| `split` | `[]` | 拆单发货 |

`combination_id`, `pink_id` and `advance_id` are **no longer pinned**: 拼团 and
预售 are live (stream D), and those fields now carry real activity ids.

## Decisions other streams must know

- **`order_id` carries the order number on the storefront and the surrogate id
  in 商家管理.** S's CR-1-h answer: `orderRef` resolves either, but only where an
  owner scopes the lookup, so the staff routes keep the surrogate.
  `api/mappers/order.js` and `api/mappers/staff.js` differ deliberately.
- **Buy-now has no hidden cart row, and the活动 rides in the ticket.**
  `order_confirm` receives `buynow:<skuId>:<qty>[:<kind>:<activityId>[:<groupId>]]`;
  `parseBuyNowTicket` turns it back into `{source: 'buy-now', item, kind,
  kindMeta}`. The confirm page forwards nothing but `cartId` to the preview,
  which is why 拼团/预售 could not be passed alongside it.
  `checkoutInput.item` is a nested object — a flat `{skuId, quantity}` is
  refused by the `buyNowNeedsAnItem` refine before the handler sees it.
- **`unique` carries the SKU id, not the SKU code**, everywhere a page hands a
  spec back to the API.
- **拼团/预售 detail pages are assembled from an activity DTO.**
  `api/mappers/activity.js` rebuilds the picker columns from `sku.specValues`
  and re-keys the SKUs the way the 商品详情 renderer expects, so the pages did
  not have to change. `pink_bool` is derived from the group status
  (succeeded → 1, failed/cancelled → −1, open → 0).
- **One generation of WeChat auth, not two.** `authType` mints the session in
  one call; `authLogin` answers from a module-level cache because the `wx.login`
  code it spent is single-use. The MP 「手机号 + 短信验证码」 screens post to
  `/auth/sessions/sms` — a typed phone and a typed code is a platform-agnostic
  sign-in, and the openid binds on the next `authLogin`.
- **`getPhoneNumber` sends `{phoneCode}`.** The `encryptedData` + `iv` path is
  not ported: decrypting it client-side needs `session_key` to leave the server.
- **发票抬头 is device-local** (`libs/invoiceTitles.js`); nothing about it is
  authoritative.
- **物流 is composed client-side** from the order, its `shipments` and the
  tracking of the parcel being shown. A parcel whose tracking call fails still
  renders, without a timeline.
- **改价 posts a discount**, because `orderPriceBody` has no "set the total".
- **Uploads go to `POST /api/v1/uploads?purpose=…`, field name `file`.**
  `uploadPurposeFor` guesses the purpose from the legacy path and a caller that
  knows says so. 商家管理's 添加商品 says `{purpose: 'staff'}` — it was landing in
  `review`, the shopper-photo bucket.
- **订阅消息 is asked for per moment** (`order-create`, `order-pay`,
  `order-ship`, `refund`), not as one map. `utils/SubscribeMessage.js` resolves
  without prompting when a scene has no templates, rather than calling
  `requestSubscribeMessage` with `tmplIds: []`, which throws.

## The guard, and why it grew a third failure mode

`scripts/check-api-routes.mjs` matched `request.get(` and nothing else. A
composed call is usually written

```js
request
  .get('/api/v1/…', { … })
  .then(…)
```

and the guard could not see a single one of them — the summary still read
`0 broken`, which is the one thing a route guard must never do. It now matches
the chained spelling too, and it fails on any `request.*(` whose first argument
is not a string literal. Seven calls appeared the moment it could see them, one
of them a live route sitting under a stale `CONTRACT-PENDING(F1)` marker.

That is also why `expressView` takes three thunks: it used to assemble the
tracking URL out of a `trackingBase` fragment, which is unreadable by
construction.

## Ownership extensions

`scripts/` and `tests/` under `template/uni-app/` are H's, as is
`libs/invoiceTitles.js`.

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

Exports, second pass — each with its reason, because "no route" alone is not one:

| Export | Why it is gone |
| ------ | -------------- |
| `silenceAuth` | asked "does this shop use 静默 or 手动 授权" — a question only two auth generations made necessary |
| `remoteRegister` | "hand me a token for a user I name" is the shape the contract exists to refuse; it had no call site |
| `getSubscribe` | 「已关注公众号?」 means reading the OA's follower list for a person; `diyComponents/follow.vue` now always renders the 未关注 state |
| `switchH5Login` | 多账号切换 needed two coexisting token formats |
| `getCodeApi`, `verifyCode` | the graphic captcha has no successor; both resolve `{key: ''}` locally |
| `openExtrctSubscribe`, `openBargainSubscribe`, `openRechargeSubscribe`, `openRevenueSubscribe` | subscribe helpers for 核销 / 砍价 / 充值 / 佣金, all retired; zero call sites |
| `orderExportTemp`, `orderDeliveryInfo`, `orderOrderDelivery` | 电子面单 and the 配送员 list — CR-4-h §4/§5, ruled out of scope by S |

First pass: the 83 unreferenced exports the field report found, plus
`setOfflinePay`, `orderSplitInfo`, `orderSplitDelivery`, `getInvoiceLink`,
`spread`, `appleLogin`.

### Call sites edited (the minimum the re-pointing forced)

First pass:

| File | Why |
| ---- | --- |
| `pages/goods/order_confirm/index.vue` | 门店自提 / 送礼 branches removed; `checkShipping` collapsed to express-only |
| `pages/goods/order_details/index.vue` | gift-order imports and `receiveGift` removed |
| `pages/goods/goods_return*/`, `order_refund_goods/` | upload calls pass `{purpose: 'refund'}` |
| `pages/users/user_info/`, `eidtUserModal` | upload calls pass `{purpose: 'avatar'}` |
| `pages/admin/delivery/index.vue` | 拆单 removed; the 发货 form also sends `delivery_company_id` |
| `pages/admin/{orderList,orderDetail,refund_order_list,refund_order_detail}` | 线下付款 removed; 改价 also sends `pay_price` |
| `pages/users/user_invoice_list/index.vue` | the row links by invoice id; the goods thumbnail is guarded |
| `pages/users/login/index.vue`, `utils/index.js`, `App.vue`, `libs/{wechat,routine}.js` | imports of retired exports |
| `subpackage/diyComponents/{tabNav,homeComb}.vue` | `getCategoryVersion` imported from the wrong module — a pre-existing break |

Second pass:

| File | Why |
| ---- | --- |
| `pages/activity/goods_combination_status/index.vue` | 参团 must pass `pinkId`; it was in page state only |
| `pages/user/index.vue`, `pages/users/user_info/index.vue` | `setVisit` gone, `switchH5Login` branch gone, `getPhoneNumber` sends `{phoneCode}` |
| `pages/users/components/login_mobile/{index,routine_phone}.vue`, `pages/users/wechat_login/index.vue`, `pages/users/auth/index.vue` | `{phoneCode}`, and the `silenceAuth` imports |
| `App.vue`, `components/Authorize.vue`, `libs/routine.js` | imports of `remoteRegister` / `silenceAuth`, and the dead methods behind them |
| `subpackage/diyComponents/presale.vue` | `getAdvancellList` → `getPresellList` (a pre-existing dangling import, fixed now that 预售 is contracted) |
| `subpackage/diyComponents/follow.vue` | `getSubscribe` gone |
| `pages/admin/goods/addGoods.vue` | uploads pass `{purpose: 'staff'}` |
| `utils/SubscribeMessage.js` | rewritten around the four scenes |

## Known dangling imports (all predate this stream)

Both builds finish clean apart from seven `export … was not found` warnings —
`getAdvancellList` was the eighth and is fixed. Every one is broken on `master`
too, and none is an api function this stream re-pointed:

| Import | From | Why it stays |
| ------ | ---- | ------------ |
| `postAddress` | `pages/users/user_address_list` | never existed; the page's other calls work |
| `newcomerList` | `subpackage/diyComponents/newVip.vue` | 新人专享 is retired |
| `VUE_APP_API_URL` | `pages/users/login/index.vue` ← `@/utils` | `utils/index.js` exports `VUE_APP_WS_URL`, never this |
| `required`, `alpha_num`, `chs_phone`, `attrs` | same page ← `@/utils/validate` | a validation kit that was never committed |
| `handleError` | `pages/admin/goods/components/label/index.vue` ← `vue` | Vue 2 has no such named export |

Fixing them means editing pages, which this stream may not do; they are listed
so whoever owns those screens (E1 for 登录, A for 商品管理) picks them up.

## Change requests

| CR | Against | About | Status |
| -- | ------- | ----- | ------ |
| [CR-1-h](../cr/CR-1-h.md) | B1 | `GET /api/v1/orders/:id` should accept an order number | done (S) |
| [CR-2-h](../cr/CR-2-h.md) | B1 | change a cart row's SKU, decrement by SKU, batch favourite | done (S) |
| [CR-3-h](../cr/CR-3-h.md) | A  | a cheap "has the category tree changed?" | done (S) |
| [CR-4-h](../cr/CR-4-h.md) | B2, C | seven gaps in the mobile staff console | §1,§2,§6,§7 done (S); §4,§5 retired; §3 accepted |
| [CR-5-h](../cr/CR-5-h.md) | F1 | the upload's multipart field name, and a purpose for staff uploads | done (S) |
| [CR-1-h2](../cr/CR-1-h2.md) | D  | a shop-wide 拼团 summary for the 人气条 | open |
| [CR-2-h2](../cr/CR-2-h2.md) | E1 | 行为验证码, 小程序绑定手机号, the staff 用户管理 surface | open |
| [CR-3-h2](../cr/CR-3-h2.md) | G1 | 个人中心菜单, 底部导航, the 版式 switch | open |
| [CR-4-h2](../cr/CR-4-h2.md) | A  | the staff 商品管理 surface | open |
| [CR-5-h2](../cr/CR-5-h2.md) | B1 | 下单送券, and a staff-side coupon grant | open |
| [CR-6-h2](../cr/CR-6-h2.md) | E2 | a mini-program code for the three poster screens | open |
| [CR-7-h2](../cr/CR-7-h2.md) | F1 | the shop's public settings, and 图片转 base64 | open |

## How to run any of it

```bash
cd template/uni-app
npm ci                      # only the builds need it; the tests and scripts do not

npm run check:routes        # the guard; `node scripts/check-api-routes.mjs --json` for the table
npm run report:fields       # rewrites scripts/reports/page-fields.{json,md}
npm run fixtures            # after a contract changes, before the tests
npm test                    # vitest, borrowed from next/packages/contracts

# the same api functions over real HTTP, against the contract mock:
(cd ../../next/packages/testing && MOCK_PORT=4013 pnpm mock) &
MOCK_URL=http://127.0.0.1:4013 npm test

npm run build:h5
npm run build:mp-weixin
```

`npm run fixtures` (`dump-contract-examples.mjs`) reads
`next/packages/contracts/src/routes.gen.ts`, not `openapi.json`: the OpenAPI
writer drops `examples`, and the examples are the whole point of the fixtures.
Run `pnpm gen` in `next/` first if a contract changed — both files are
generated, and a stale `openapi.json` makes the guard report routes as missing
that are merely not built yet.

Two things about the build scripts, both fixed here because nothing built
before: this project keeps its sources at the package root rather than in
`src/`, so the scripts pass `UNI_INPUT_DIR=.`; and Node ≥ 22 removed
`util.isRegExp`, which `postcss-urlrewrite` calls while the mp-weixin config is
validated, so they `--require ./scripts/node-compat.cjs`. Output lands in
`dist/dev/<platform>/` and is gitignored.

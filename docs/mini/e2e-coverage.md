# 小程序 e2e 覆盖矩阵

切换（`docs/mini/cutover.md`）前，旧 uni-app 的每条 e2e 场景（`e2e/storefront/specs/`）、每条引用 e2e 的 SMOKE 规则、计划 §12 列出的必测旅程，都要在新小程序的 `e2e/storefront/specs-mini/` 里有对应的测试，或者在本文写明为什么没有。本文就是这张对照表。

- 跑法：`pnpm --filter @shop/e2e-storefront test:mini`（`SHOP_E2E_CLIENT=mini`，Playwright 项目 `mini-h5`，跑 `specs-mini/` 下的全部文件）。栈和「模拟小程序」H5 构建见 `e2e/storefront/README.md`。
- Page object 在 `e2e/storefront/src/mini-pages/`：`shopping-pages.ts`、`shopping-shopper.ts`、`order-pages.ts`、`order-shopper.ts`、`aftersale-pages.ts`、`promo-pages.ts`、`decor-pages.ts`（I2 新增：装修后台 API 和 微页面）、`shown.ts`。
- 引用写法：`文件::测试标题`，文件相对 `e2e/storefront/specs-mini/`。

状态：**已覆盖**＝小程序测试断言了同一件事；**部分**＝主要行为覆盖，某个细节没有（写明哪个）；**已知失败**＝测试已写好，用 `test.fail` 标记，等应用修复；**待定**＝页面还没合入，测试等页面；**缺口**＝没有测试，原因写明。

## 1. 旧 uni-app 场景 → 小程序

### `login.spec.ts`

| 旧场景                                                                         | 状态               | 小程序测试                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the terms checkbox blocks submission until it is checked                       | 已覆盖             | `login.spec.ts::a new WeChat user ticks the terms, signs up with an SMS code, and a wrong code leaves it usable`（未勾选时点 手机号快速登录 只提示，不发请求）                                                                                                                                        |
| password login reaches an authenticated screen                                 | 缺口               | 小程序**没有密码登录**。计划要求放在「其他方式」里，E、A3 都没做。静默登录后的已登录状态见 `login.spec.ts::a WeChat user the shop knows is signed in on opening the app, with no login page`（`/api/v1/profile` 200）                                                                                 |
| a phone number receives an SMS code it can log in with                         | 已覆盖             | `login.spec.ts::a new WeChat user ticks the terms, signs up with an SMS code, and a wrong code leaves it usable`                                                                                                                                                                                      |
| a wrong SMS code is rejected and the code stays usable                         | 已覆盖             | 同上（错码记一次 `attempts`，正确码仍可登录，用后删除）                                                                                                                                                                                                                                               |
| a 401 mid-session redirects to login exactly once, not once per failed request | 已覆盖（行为不同） | 小程序遇到 401 不跳登录页，而是静默续期后重放请求：`login.spec.ts::a session the server stopped honouring is renewed once, and the reads that failed are replayed`（多个 401 只续期一次）、`login.spec.ts::a write that meets an expired session is replayed once after renewal, not lost or doubled` |

### `cart-checkout-pay.spec.ts`

| 旧场景                                                                                        | 状态   | 小程序测试                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a shopper changes the quantity in the cart and checks out to a freight-inclusive total        | 已覆盖 | `shopping.spec.ts::+ in the cart changes the quantity on the server and the total`；含运费总价见 `new-shopper-buys.spec.ts::a new WeChat user signs in, binds a phone, buys a product and pays`（¥39 + ¥6） |
| a shopper pays an order at the cashier and the order is paid                                  | 已覆盖 | `new-shopper-buys.spec.ts::a new WeChat user signs in, binds a phone, buys a product and pays`、`shop-journey.spec.ts::a shopper goes from 首页 through 分类 and the cart to a paid order`                  |
| the confirm page itemises the freight it charges                                              | 已覆盖 | `coupons.spec.ts::确认订单 itemises the freight and takes a category-scoped coupon for a product in that category`                                                                                          |
| a shopper applies a granted coupon on the confirm page                                        | 已覆盖 | `shopping.spec.ts::确认订单 applies the best coupon, lets the shopper drop it and pick it again`                                                                                                            |
| a shopper applies a category-scoped coupon on the confirm page                                | 已覆盖 | `coupons.spec.ts::确认订单 itemises the freight and takes a category-scoped coupon for a product in that category`                                                                                          |
| a shopper submits the confirm page, pays at the cashier, and sees the order awaiting shipment | 已覆盖 | `orders.spec.ts::a shopper pays, follows the parcel, confirms receipt in WeChat and reviews`（付款后在 待发货，详情显示 等待发货）                                                                          |
| a shopper adds a product to the cart from its page and the cart agrees                        | 已覆盖 | `shopping.spec.ts::the 规格 sheet prices the picked SKU and adds that one to the cart`                                                                                                                      |

### `groupbuy.spec.ts`、`presale.spec.ts`

| 旧场景                                                                           | 状态   | 小程序测试                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| two shoppers complete a group-buy team                                           | 已覆盖 | `promo.spec.ts::a shopper opens a group buy, a friend joins on another phone, and the team completes`；另有过期退款 `promo.spec.ts::a team nobody joins fails when its time is up, and the shopper is refunded`（旧套件没有）          |
| presale price is what the order shows, not the catalogue price                   | 已覆盖 | `promo.spec.ts::a presale is booked and paid in full, and says when it ships`（确认订单、收银台、订单行都是 ¥78）；订单详情 和 我的订单 见下一行                                                                                       |
| a presale with a stacked coupon still shows the presale price on the order pages | 已覆盖 | `coupons.spec.ts::a presale with a stacked coupon still shows the presale price on the order pages`：订单详情 印 ¥78.00、优惠券 -¥5.00、应付 ¥73.00，我的订单 同价，都不出现 ¥88.00（J1 修好：页面读行上的 `adjustments`，同 uni-app） |

### `refund.spec.ts`、`ship-receive-review.spec.ts`

| 旧场景                                                                   | 状态   | 小程序测试                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a shopper applies for a refund, it is approved, and the money moves      | 已覆盖 | `aftersale.spec.ts::a shopper applies for a refund, the merchant approves, the page follows it`                                                                                                                                                            |
| a refunded request is filed under 已退款 with the 已退款 stamp           | 已覆盖 | 同上（我的售后 的 已退款 分栏、订单详情 标题 已退款）                                                                                                                                                                                                      |
| a shopper opens the refund form from the order page                      | 已覆盖 | 同上（订单详情 的 申请售后）；退货退款填运单见 `aftersale.spec.ts::a shopper returning shipped goods fills in the return waybill`                                                                                                                          |
| a shopper sees a shipped order with its courier and tracking number      | 已覆盖 | `orders.spec.ts::a shopper pays, follows the parcel, confirms receipt in WeChat and reviews`（物流页 顺丰速运 + 运单号）                                                                                                                                   |
| a shopper reviews a received order line                                  | 已覆盖 | 同上；审核链路见 `reviews.spec.ts`（第 3 节）                                                                                                                                                                                                              |
| a shopper confirms receipt from the order page and reviews it from there | 已覆盖 | 同上（确认收货 走微信确认收货组件，`via: 'wechat-component'`）；组件不回调、只回到前台时的兜底（C07）：`orders.spec.ts::when WeChat's 确认收货 component never calls back > the app, back in the foreground, asks the server and shows the order received` |

### `home-category-product.spec.ts`、`diy-picked.spec.ts`

旧套件测的是旧 `diy` 域（`GET /api/v1/diy/pages/home` + 生产 DIY 数据）。小程序只读装修 v2（`GET /api/v1/pages/*`），所以对应的是 v2 的测试，不是同一份数据。

| 旧场景                                                                          | 状态   | 小程序测试                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the DIY home page renders every fixture component with no console error         | 已覆盖 | 首页（种子里的 v2 文档）：`shop-journey.spec.ts::a shopper goes from 首页 through 分类 and the cart to a paid order`；全部组件类型：`decor.spec.ts::a page published in the admin shows each of its blocks in order, and follows the next publish`（十种组件，无控制台错误、无失败请求） |
| the category tab shows the seeded category                                      | 已覆盖 | `shop-journey.spec.ts::a shopper goes from 首页 through 分类 and the cart to a paid order`                                                                                                                                                                                               |
| the micro page from ${fixture} renders its own components, not the home page's  | 已覆盖 | `decor.spec.ts::a page published in the admin shows each of its blocks in order, and follows the next publish`                                                                                                                                                                           |
| a multi-spec product shows its price range and both spec groups                 | 部分   | `shopping.spec.ts::the 规格 sheet prices the picked SKU and adds that one to the cart`（两组规格、每个 SKU 的价）；商品页顶部的价格区间没断言                                                                                                                                            |
| a fixed-postage product shows its own name and price, not the freight product's | 已覆盖 | `new-shopper-buys.spec.ts::a new WeChat user signs in, binds a phone, buys a product and pays`                                                                                                                                                                                           |
| a 商品列表 on 指定商品 shows exactly the picked products, in the order picked   | 已覆盖 | `decor.spec.ts::a page published in the admin shows each of its blocks in order, and follows the next publish`（`productGrid` 手选两件，改序再发布后顺序跟着变，DECOR-013）                                                                                                              |

### `site-config-share.spec.ts`

| 旧场景                                                                           | 状态   | 小程序测试                                                                                                                                               |
| -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the public site config route answers, cached and versioned                       | 已覆盖 | 小程序读 `GET /api/v1/app/config`：`app-config.spec.ts::the app config answers cached and versioned: an ETag, a 304 for it, a new one after a save`      |
| a product's share panel opens with a poster action, independent of site config   | 已覆盖 | `share.spec.ts::a product's 分享 sheet makes a poster carrying the product's 小程序码`                                                                   |
| the storefront shows the shop's own logo and copyright, not the bundled defaults | 部分   | `app-config.spec.ts::the login page shows the shop's own logo and name, from the app config`。小程序不显示版权图（设计没有这一块），所以版权部分没有对应 |

### `user-center.spec.ts`

| 旧场景                                                      | 状态 | 说明                                                                                                                                               |
| ----------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| the 个人中心 read answers the built-in page, not a 404      | 待定 | 服务端部分已由 DECOR-005 的集成测试覆盖。「我的」页属于 E 流（账户与内容页），在 `storefront/mini` 上还是 建设中 页；E 合入后补 `specs-mini/` 测试 |
| 我的 shows the member header, the order row and 我的服务    | 待定 | 同上（`userCard`、`orderEntry`、`serviceGrid` 三个组件本身已在 `@shop/storefront-blocks` 的单元测试里）                                            |
| a visitor who has not logged in sees the header ask them to | 待定 | 同上                                                                                                                                               |

E 的分支里已有 `specs-mini/account.spec.ts`（昵称内容检查、地址增改删、收藏、消息、发票抬头、我的评价、注销账号），随 E 合入。

## 2. SMOKE 规则 → 小程序

`docs/invariants.md` 的 SMOKE 行在切换前**同时**引用旧测试和小程序测试；旧引用在切换时和旧套件一起删。

| 规则      | 旧引用                                                      | 小程序引用                                                                                                                                                 |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMOKE-002 | `home-category-product.spec.ts`（DIY 首页商品列表）         | `decor.spec.ts::a page published in the admin shows each of its blocks in order, and follows the next publish`（装修页商品列表，无控制台错误、无失败请求） |
| SMOKE-003 | `home-category-product.spec.ts`（`/api/v1/diy/pages/home`） | `shop-journey.spec.ts::a shopper goes from 首页 through 分类 and the cart to a paid order`（已登录顾客打开 `/api/v1/pages/home` 首页）                     |
| SMOKE-004 | `login.spec.ts`（密码登录后 `/api/v1/profile` 200）         | `login.spec.ts::a WeChat user the shop knows is signed in on opening the app, with no login page`（静默登录后 `/api/v1/profile` 200）                      |
| SMOKE-005 | `cart-checkout-pay.spec.ts`（收银台付款）                   | `new-shopper-buys.spec.ts::a new WeChat user signs in, binds a phone, buys a product and pays`                                                             |

SMOKE-001、SMOKE-006 至 SMOKE-012 引用的是 core 集成测试，与客户端无关，不变。

## 3. 计划 §12 必测旅程

| 旅程                    | 小程序测试                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 静默登录                | `login.spec.ts::a WeChat user the shop knows is signed in on opening the app, with no login page`                                                                                                                                                                                                                                            |
| 手机号快速登录          | `new-shopper-buys.spec.ts::a new WeChat user signs in, binds a phone, buys a product and pays`、`shopping.spec.ts::a guest browses freely and signs up only at 加入购物车, then comes back to it`                                                                                                                                            |
| 短信验证码登录          | `login.spec.ts::a new WeChat user ticks the terms, signs up with an SMS code, and a wrong code leaves it usable`                                                                                                                                                                                                                             |
| 密码登录                | **缺口**：小程序没有做（见第 1 节）                                                                                                                                                                                                                                                                                                          |
| 401 续期 + 重放         | `login.spec.ts::a session the server stopped honouring is renewed once, and the reads that failed are replayed`、`login.spec.ts::a write that meets an expired session is replayed once after renewal, not lost or doubled`                                                                                                                  |
| 下单 + 付款             | `new-shopper-buys.spec.ts`、`shop-journey.spec.ts`                                                                                                                                                                                                                                                                                           |
| 拼团成团、过期退款      | `promo.spec.ts` 前两条                                                                                                                                                                                                                                                                                                                       |
| 预售                    | `promo.spec.ts::a presale is booked and paid in full, and says when it ships`；订单页价格见 `coupons.spec.ts`                                                                                                                                                                                                                                |
| 优惠券                  | `promo.spec.ts::a coupon claimed at 领券中心 waits in 我的优惠券 and comes off at 确认订单`、`shopping.spec.ts::确认订单 applies the best coupon, lets the shopper drop it and pick it again`、`coupons.spec.ts`                                                                                                                             |
| 售后 + 退款             | `aftersale.spec.ts` 两条                                                                                                                                                                                                                                                                                                                     |
| 评价与审核              | `reviews.spec.ts::CONTENT-001: a review the content check holds is shown on the product only once the merchant publishes it`、`reviews.spec.ts::a review the content check passes is on the product at once, and gone once the merchant hides it`；下单到评价见 `orders.spec.ts`                                                             |
| 装修发布 → 前台可见     | `decor.spec.ts::a page published in the admin shows each of its blocks in order, and follows the next publish`（后台 API 建页、十种组件、发布、小程序逐个组件断言、再发布跟随）、`decor.spec.ts::DECOR-012: the editor’s preview token shows the draft under a banner, and nothing without it`；编辑器本身见 `e2e/admin/specs/decor.spec.ts` |
| 隐私弹窗                | **缺口（e2e）**：`installPrivacyHandler` 依赖 `wx.onNeedPrivacyAuthorization`，H5 没有这个 API，「模拟小程序」也没有模拟它。现有覆盖：`apps/mini/src/ui/privacy-sheet.test.tsx`（组件）和真机检查 `docs/mini/device-check.md` D03。要进 e2e 需要在 `apps/mini/src/platform/h5-mp-emulation.tsx` 里加模拟（A 流的地盘），见第 4 节            |
| web-view 业务域名白名单 | `decor.spec.ts::a web-view link opens only a 业务域名 the shop listed; any other link is copied`（后台存 `wechat-mini.webviewDomains`，允许的进 web-view 页，其他的复制链接并提示）。E 的 web-view 页合入后，可再断言它自己的拦截提示                                                                                                        |
| 分享码 scene 解码       | `share.spec.ts::SHARE-001: a 小程序码 opens the product, activity, coupon or decor page it was made for`（商品、拼团、预售、领券中心 `_`、微页面；按服务端缓存的 `(page, scene)` 打开）                                                                                                                                                      |

## 4. 缺口与后续

1. **密码登录**：小程序没有。要么在登录页「其他方式」里补上（再补测试），要么明确放弃并改计划。放弃时 SMOKE-004 的旧引用在切换时删除，只留小程序引用。
2. ~~**预售订单页价格**~~：J1 已修好（`apps/mini/src/lib/order-price.ts`），`coupons.spec.ts` 的 `test.fail` 已删。
3. **隐私弹窗 e2e**：在「模拟小程序」里模拟 `onNeedPrivacyAuthorization`（比如 emulation 数据里加 `privacy: 'agree' | 'reject'`，在第一次调用隐私接口前触发），然后补一条 手机号按钮 → 弹窗 → 同意 → 继续 的测试。
4. **账户页**（E 流）：E 合入后，E 自带的 `account.spec.ts` 进入本表；再补 `user-center.spec.ts` 的三条（我的 页的头部、订单入口、我的服务，未登录时的 登录 / 注册）。
5. **商品页价格区间**：`shopping.spec.ts` 可顺手加一行断言。

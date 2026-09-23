# CR-4-i — storefront journeys broken in the uni-app mapper and page layer

- **Stream:** I (storefront e2e), raised against the uni-app layer (H / H3 ownership:
  `template/uni-app/{api,pages}/**`). The orchestrator routes it.
- **Status:** **done** (H4, `rewrite/ws-h4-storefront-followup`) — see "Resolution" at the end
- **Found on:** `rewrite/integration` at `fa9c7c2d9` (after the H3 merge), H5 build, real stack
  (`next/e2e/storefront`, `pnpm --filter @shop/e2e-storefront test`).
- **Affects:** `template/uni-app/api/{api,order}.js`, `template/uni-app/api/mappers/{catalog,order,refund}.js`,
  `template/uni-app/pages/goods/order_confirm/index.vue`,
  `template/uni-app/pages/activity/goods_combination_{details,status}/index.vue`, `App.vue`, and
  whatever serves `/statics/images/*`.

Every section below is a place where a shopper's tap fails today. Each blocked journey in
`next/e2e/storefront/specs/**` is a `blockedBy('CR-4-i §n: …')` test that still carries the full
motion and assertions. §6 to §13 come with a patch that was applied to a copy of the uni-app tree
and **proved by the suite**: with every patch below applied, every CR-4-i-blocked journey passes
(micro pages ×2, freight line, coupon, confirm-page submit → pay, group-buy, refund tab and stamp,
refund entry from order detail, confirm receipt from order detail). The patches are the evidence
and a suggestion, not the required shape of the fix.

## How to prove a fix

```sh
cd next
pnpm turbo run build --filter @shop/web            # the edge serves the H5 build from the tree it points at
SHOP_E2E_UNIAPP_DIR=/abs/path/to/fixed/template/uni-app \
SHOP_E2E_RUN_BLOCKED=1 \
  pnpm --filter @shop/e2e-storefront test
```

`SHOP_E2E_RUN_BLOCKED=1` runs the `blockedBy` tests instead of skipping them. When a section is
fixed on integration, its `blockedBy` line comes out of the spec (the fixing stream may do that in
`next/e2e/storefront/specs/**`, or leave it to stream I).

## §1, §2 — resolved by H3

`getThemeInfo('theme')` and the navigation-list unwrap were in the draft of this CR; H3
(`503fbcf35`) fixed both. Listed so the numbering below is stable.

## §3 — 首页 coupon popup throws on every home load

`pages/index/index.vue` `getCoupon()` reads `res.data.list.length`; `api/api.js` `getCouponV2()`
maps with `toLegacyCouponArray`, so `data` is a bare array and `data.list` is `undefined`:
`unhandledrejection TypeError: Cannot read properties of undefined (reading 'length')`. The popup
never shows. Suggested: map `getCouponV2` to the `{ list, show }` shape the page reads (as
`getCouponNewUser` is read two functions below). Listed in `next/e2e/storefront/src/known-gaps.ts`
until fixed.

## §4 — `App.vue` fetches `/api/get_script` on every launch

`App.vue` (H5 block, ~line 211) `fetch(`${HTTP_REQUEST_URL}/api/get_script`)` and appends the body
as a script. The route does not exist in the rewrite: 404, the body is Next's HTML 404 page, and
`appendChild` throws `Unexpected token '<'`. Suggested: drop the fetch, or point it at a site-config
field if the custom-script feature is kept (then it needs a contract). Known gap in `known-gaps.ts`.

## §5 — `/statics/images/*` is not served

38 references in `pages/**` and `components/**` to `${HTTP_REQUEST_URL}/statics/images/…`
(`noOrder.gif`, `noCoupon.png`, `empty-box.png`, `co-bag.png`, `open.gif`, `noAddress.png`, …): the
legacy PHP `public/statics` tree. Nothing in the rewrite serves it, so every empty state and the
开团 gif is a broken image. Needs an owner decision: ship the files in the H5 build's `static/`
and re-point the references, or serve the tree from `next/apps/web/public` (and on the deploy's
edge). Known gap in `known-gaps.ts`.

## §6 — micro pages render the home page

`api/api.js` `getThemeInfo(type, data)` checks `type === 'home' || type === undefined` **before**
`data.theme_id`. The micro page (`pages/annex/special/index?theme_id=`, line 732) calls
`getThemeInfo("home", { theme_id })`, so the home branch wins and every micro page shows the home
page. Blocks
`home-category-product.spec.ts` › micro page ×2.

```diff
 export function getThemeInfo(type, data) {
   const src = data || {};
-  if (type === 'home' || type === undefined) {
-    return request.get('/api/v1/diy/pages/home', {}, { noAuth: true, map: toLegacyDiyPage });
-  }
   if (src.theme_id) {
     return request.get(`/api/v1/diy/pages/${src.theme_id}`, {}, { noAuth: true, map: toLegacyDiyPage });
   }
+  if (type === 'home' || type === undefined) {
+    return request.get('/api/v1/diy/pages/home', {}, { noAuth: true, map: toLegacyDiyPage });
+  }
```

## §7 — order detail crashes on render

`pages/goods/order_details/index.vue` reads `orderInfo.help_info.<field>` and `orderInfo.split.length`
unguarded. `api/mappers/order.js` `RETIRED_ORDER_FLAGS` sets `help_info: null` and has no `split`,
so the page throws on render and shows nothing: no 确认收货, no 查看物流, no 申请退款, no 评价. Blocks
`ship-receive-review.spec.ts` › full order-detail flow and `refund.spec.ts` › refund from order
detail. The order list 查看详情 lands on the same crash.

```diff
-  help_info: null,
+  help_info: {},
+  split: [],
```

## §8 — group-buy 开团 / 参团 never reach checkout; zero-spec lines have no `attrInfo`

Four gaps along one path. Blocks `groupbuy.spec.ts`.

1. `api/mappers/catalog.js` `toLegacySku` has no `product_stock`, and the combination pages gate
   their buy button on it.
2. `goods_combination_details` `DefaultSelect` writes the selection only
   `if (productSelect && productAttr.length)`. A single-SKU product has `productAttr` empty, so
   nothing is selected and 立即开团 does nothing.
3. `goods_combination_status` has the same guard, and only calls `DefaultSelect()` when
   `productAttr != 0`, so 参团 stays dead for single-SKU products.
4. `toLegacyOrderItem` emits `attrInfo` only `hasSpec`. The review page (`goods_comment_con`) and
   `goods_logistics` read `attrInfo.price` unguarded, so the review page throws on a zero-spec line
   and 物流 shows `¥NaN`.

```diff
 // api/mappers/catalog.js toLegacySku
+    product_stock: toInt(sku.stock, 0),
 // api/mappers/order.js toLegacyOrderItem
-      ...(hasSpec ? { attrInfo } : {}),
+      attrInfo: hasSpec ? attrInfo : { ...attrInfo, suk: '' },
 // pages/activity/goods_combination_details/index.vue DefaultSelect
-      if (productSelect && productAttr.length) {
+      if (productSelect) {
 // pages/activity/goods_combination_status/index.vue
-				if (productSelect && productAttr.length) {
+				if (productSelect) {
 …
-						if (that.attr.productAttr != 0) that.DefaultSelect();
+						that.DefaultSelect();
```

## §9 — the confirm page's 配送运费 shows `¥NaN`

`order_confirm` renders the freight line from `priceGroup.storePostage - priceGroup.storePostageDiscount`.
`toLegacyOrderConfirm` (priceGroup) and `toLegacyOrderComputed` do not set
`storePostageDiscount`, so the line reads `¥NaN` (the 合计 is right). Blocks
`cart-checkout-pay.spec.ts` › freight line.

```diff
 // toLegacyOrderConfirm priceGroup
+      storePostageDiscount: 0,
 // toLegacyOrderComputed
+      storePostageDiscount: 0,
```

## §10 — 提交订单 is always a 422

Every order create from the confirm page is refused, for three reasons, each enough on its own:

1. `order_confirm` does not pass `cartId` in the create data (nor to `computedPrice`), so
   `fromLegacyCheckoutInput` sends no cart item ids.
2. `fromLegacyOrderCreateInput` sets `idempotencyKey` to `''` when the page has no `orderKey`, and
   the contract requires a non-empty key.
3. The page sends `custom_form: that.confirm`, which is `[]` when the product has no custom form,
   and the mapper forwards it as `customForm: []`. The contract takes an object.

Blocks `cart-checkout-pay.spec.ts` › submit → pay → 待发货, and so the whole in-app checkout.

```diff
 // pages/goods/order_confirm/index.vue computedPrice() data and the create data
+					cartId: this.cartId,           // (that.cartId in the create)
 // api/mappers/order.js fromLegacyOrderCreateInput
-  body.idempotencyKey = String(key || src.orderKey || '');
+  body.idempotencyKey = String(key || src.orderKey || '') ||
+    `h5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
-  if (src.custom_form) body.customForm = src.custom_form;
+  if (src.custom_form && !Array.isArray(src.custom_form) && typeof src.custom_form === 'object') {
+    body.customForm = src.custom_form;
+  }
```

A key generated in the mapper is fresh per tap, so a double tap creates two orders. The real fix
should mint the key once per confirm-page visit (for example in `onLoad`), which is where the page
had `orderKey` before.

## §11 — the confirm page's coupon picker is always empty

`order_confirm` `getCouponList()` calls `getCouponsOrderPrice(totalPrice, {cartId, new, shippingType})`
with no lines. The mapper falls back to `productId: '0'`, the applicable-coupons route refuses it
(422), and the picker shows 暂无优惠券. A shopper cannot use a coupon at checkout. Blocks
`cart-checkout-pay.spec.ts` › coupon.

```diff
 // order_confirm getCouponList data
+					lines: (this.cartInfo || []).map(line => ({
+						productId: String(line.product_id),
+						categoryIds: [],
+						amount: String(line.sum_price)
+					}))
```

`categoryIds: []` is enough for the seeded 满减 coupon. A category-scoped coupon needs the line's
real category ids, and nothing in `cartInfo` carries them today. Whoever fixes this should decide
whether the mapper or the route supplies them.

## §12 — the refund list tabs do not filter

`pages/users/user_return_list` sends `{ refund_status: <tab> }` (line 178). `api/order.js`
`getNewOrderList` reads `src.type`, so every tab requests `state=all`. Blocks `refund.spec.ts` ›
已退款 tab.

```diff
-  const query = { state: fromLegacyRefundState(src.type) };
+  const tab = src.refund_status !== undefined ? Number(src.refund_status) : -1;
+  const query = { state: tab === 1 ? 'open' : tab === 2 ? 'succeeded' : 'all' };
```

## §13 — refund rows show the wrong status stamp

The page picks its stamp from `refund_type`: 1/2 申请中, 3 已拒绝, 4 待退货, 5 退款中, 6 已退款.
`api/mappers/refund.js` `REFUND_TYPE` numbers from 0 (applied 0 … succeeded 4), so a succeeded
refund shows 待退货 and an applied one shows none. Blocks `refund.spec.ts` › `.icon-yituikuan`.

```diff
 const REFUND_TYPE = {
-  applied: 0, rejected: 1, approved: 2, returned: 3, refunding: 3, succeeded: 4, cancelled: 5, closed: 5,
+  applied: 1, rejected: 3, approved: 4, returned: 5, refunding: 5, succeeded: 6, cancelled: 0, closed: 0,
 };
```

## §14 — smaller display defects seen on the way (no journey blocked)

- **Order list 全部 tab shows only unpaid orders.** The page's 全部 tab is `orderStatus 9`, and
  `TAB_BY_LEGACY_TYPE` in `api/mappers/order.js` maps `9: 'unpaid'`. It should map to `'all'`.
- **Order list rows carry no 待发货 label.** A paid, unshipped (express, `shipping_type` 0 on the
  row) order renders no status text in `pages/goods/order_list`. The row fields that template
  branches on are not what the list mapper fills.
- **`order_pay_status` shows 订单号 as the numeric order id**, not the order number.
- **The refund list shows 订单号 as the refund id**, not the order number.

## Until then

Each blocked journey is `blockedBy('CR-4-i §n: …')`. §3, §4 and §5 are in
`next/e2e/storefront/src/known-gaps.ts`, so journey 1's "no console error, no failed request"
assertion still catches anything new. `docs/rewrite/status/i.md` has the journey × CR matrix.

## Resolution (H4)

Every section is closed in the uni-app tree; every `blockedBy('CR-4-i …')` is lifted and the
journeys pass on the H5 build against the real stack. Where H4's fix differs from the suggested
patch, the difference is named.

- **§3** `getCouponV2` → `toLegacyCouponPopup` `{ list, image }` (claimable templates only);
  `getCouponNewUser` had the same bare-array shape → `toLegacyNewUserCouponPopup`.
- **§4** the `get_script` fetch is gone from `App.vue`.
- **§5** the 16 referenced images ship in `template/uni-app/static/images/legacy/` (byte-equal
  copies); every `/statics/images/` reference is re-pointed; dead `<emptyPage src>` attributes
  removed. `known-gaps.ts` is empty.
- **§6** `getThemeInfo` checks `theme_id` before the `home` alias.
- **§7** `help_info: {}` and `split: []` on every order row/detail, fresh objects per order.
- **§8** `toLegacySku` adds `product_stock`; `toLegacyOrderItem` always carries `attrInfo`
  (`suk ''` on a zero-spec line); the default SKU is selected whenever one is found. H4 applied
  that last guard change to **every** page with the same `if (productSelect && productAttr.length)`
  — `goods_details` (its 加入购物车 posted no `skuId`, a 422, once CR-2-h3 let the page render),
  `presell_details`, `goods_cate2/3`, `order_addcart` and `mixins/skuSelect.js` — pinned by a
  tree-wide test.
- **§9** `storePostageDiscount: '0.00'` in the confirm `priceGroup` and the recomputed `result`.
- **§10** the page passes `cartId` to `computedPrice` and `SubOrder`; `api/order.js`
  `orderConfirm` mints the idempotency key (`newOrderKey()`, once per confirm-page load, so a
  double tap is one order) rather than the pure mapper; `custom_form` becomes a
  `{ key: answer }` record, and an empty one is omitted.
- **§11** the page passes `cartInfo`; `fromLegacyApplicableInput` sends one line per checkout
  line. `checkoutLine` carries no category ids, so a category-scoped coupon still cannot match
  from the confirm page — filed as **CR-1-h4**.
- **§12** `getNewOrderList` reads `refund_status`; the tab index maps 0 全部 → `all`,
  1 申请中 → `open`, 2 已退款 → `succeeded`.
- **§13** `refund_type` uses the pages' numbering; a pending application is 1 (仅退款) or 2
  (退货退款) by `kind`, not always 1, because the staff refund pages audit the two differently;
  an approved refund whose goods were shipped back is 5.
- **§14** tab 9 → `all`; every order is `shipping_type` 1 (快递配送, as the staff mapper already
  had it), so a paid, unshipped row reads 待发货; `order_pay_status` and `user_return_list` show
  the order number.
- Found on the way: the poster posted `data:` URLs to `POST /api/v1/attachments/base64` (a 422 on
  every product page, the seed's images are `data:` URLs); `toDataUrls` now resolves those
  locally.

Tests: `template/uni-app/tests/storefront.pages.test.mjs` (page-level: §4, §5, §8, §10–§12, §14),
`tests/storefront.calls.test.mjs` (call-level through a fake `uni.request` answering from the
contract examples: §6, §10, the poster), and the mapper tests beside each mapper.

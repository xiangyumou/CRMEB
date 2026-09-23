# CR-2-i — presale has no reachable purchase page

- **Stream:** I (storefront e2e), raised against D2 (presale)
- **Status:** **RESOLVED** by W5T in `45b96d9a9` — registered, the list re-pointed (orchestrator's decision)
- **Affects:** `template/uni-app/pages.json`, `template/uni-app/pages/activity/presell_details/index.vue`

## What is missing

`pages/activity/presell_details/index.vue` is a complete presale product page —
it has its own `goBuy()`/`goCat()` wired to `advanceId: that.id`, its own specs
picker, its own countdown — but it is not registered in `pages.json`'s
`pages/activity` subpackage. Only `presell/index.vue` (the presale _list_) is
registered. `git log -p --follow` on the file shows this entry existed in the
legacy pre-rewrite history and was dropped before this rewrite's uni-app work
began; it is not a regression introduced by any stream building against the
new API.

The list page's own `goDetails()` does not route to `presell_details` either —
it sends the shopper to the ordinary `pages/goods_details/index?id=`, the plain
product detail page. That page has no presale purchase wiring at all: grepping
it for `advanceId`, `kind`, or any presale-specific checkout parameter finds
nothing, only a vestigial `presale_pay_status` display flag that nothing reads
past showing a badge.

So there are two presale surfaces in the source tree, and neither is a
reachable path from a shopper's tap: the list goes to a page that cannot buy a
presale, and the page that can buy one is unregistered.

## Why it matters

Journey 7 of `docs/rewrite/briefs/I-storefront-e2e.md` ("presale price is what
the order shows, not the catalogue price") cannot be exercised through the app
at all — there is no tap sequence from `/pages/activity/presell/index` that
reaches a presale checkout. `next/packages/core/src/presale/**`'s own
integration tests prove the domain logic works when a caller supplies
`kind: 'presale', activityId` directly to checkout; what is missing is the one
piece of uni-app wiring that lets a real shopper reach that call.

## Suggested fix

Register `presell_details` in the `pages/activity` subpackage of `pages.json`,
and point `presell/index.vue`'s `goDetails()` at it instead of
`goods_details/index`. `presell_details/index.vue` already has the purchase
flow built; it is untested only because nothing can navigate to it. Once
reachable, `next/e2e/storefront/specs/presale.spec.ts`'s `test.fixme` in this
suite can be lifted without any change on this stream's side.

## Until then

`next/e2e/storefront/specs/presale.spec.ts` is `test.fixme('CR-2-i: presale has
no reachable purchase page')`. `docs/rewrite/status/i.md` records the same.

## Resolution (W5T, `45b96d9a9`)

- `template/uni-app/pages.json` — `presell_details/index` registered in the
  `pages/activity` subpackage, `navigationStyle: custom` (the page draws its own
  header, as 拼团详情 does; the legacy entry was the same).
- `template/uni-app/pages/activity/presell/index.vue` — `goDetails(item)` opens
  `/pages/activity/presell_details/index?id=<activity id>` (`item.id` is the
  activity id in `toLegacyPresaleCard`; `product_id` is separate).
- Every call the detail page makes is already a bound `api/*.js` function on a
  live contract route, so no call site changed:
  - `getPresellProductDetail(id)` → `GET /api/v1/presale/activities/:id` (D2,
    public, `toLegacyPresaleDetail`);
  - 立即购买 `postCartAdd({ advanceId, uniqueId, cartNum, new: 1 })` → the
    buy-now ticket `buynow:<sku>:<qty>:presale:<activity>`, which
    `order_confirm` turns into `POST /api/v1/checkout/preview` and
    `POST /api/v1/orders` with `kind: 'presale'`,
    `kindMeta: { activityId }`, `source: 'buy-now'`;
  - 收藏 (`/api/v1/me/favorites`), 优惠券 (`/api/v1/coupons`), 购物车数量
    (`/api/v1/cart/count`), 个人信息 (`/api/v1/profile` + `/orders/counts`),
    小程序码 (`/api/v1/wechat/mini-qrcodes`), 海报图片
    (`/api/v1/attachments/base64`).
    No call without a route, so no new CR.
- **One edit beyond the two files, needed to compile at all:** line 37 of
  `presell_details/index.vue` had a legacy template syntax error
  (``$t(`已预订`)':' + …``, a missing `+`). An unregistered page is never
  compiled, so nobody saw it; registered, it failed `build:h5`. Fixed to
  ``$t(`已预订`) + ':' + …``. Nothing else in the page changed.
- `template/uni-app/tests/presale.pages.test.mjs` pins the registration, the
  list's target, that every `@/api` import of the page exists, and that each
  call — with the page's own arguments — lands on a contract route, with the
  checkout body asserted as a presale of the activity.

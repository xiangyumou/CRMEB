# CR-5-h2 — two coupon reads the storefront makes and the coupon domain does not answer

**Status (R5 sweep, 2026-09-23): RESOLVED** — `/api/v1/orders/:id/gift-coupons` and `/api/v1/staff/coupons` exist (`coupon.staff.contract.ts`, B3, `41883680c`). The status line below is kept as history.

- **Stream:** H (uni-app storefront), raised against B1 (coupon)
- **Status:** open
- **Affects:** `next/packages/contracts/src/coupon/coupon.storefront.contract.ts`
  and a staff surface for coupons

B1's storefront coupon surface is complete for the shopper: 领券中心, 我的优惠券,
the coupons applicable to a checkout — all live, all mapped, all tested. Two
other screens ask the coupon domain something, and neither has a route.

## 1. 「下单送券」 on the payment result page

`pages/goods/order_pay_status/index.vue` calls `orderCoupon(orderId)` right
after a successful payment and, if anything comes back, renders the 恭喜获得优惠券
sheet over the result. It is the 送券 rule an operator sets on a product or an
activity: pay for this, receive that.

The shopper can still find the coupons — they are in 我的优惠券 either way — but
the moment they were granted is the only moment anyone looks, and the sheet is
the entire point of configuring the rule.

**Ask:** `GET /api/v1/orders/:id/gift-coupons`, `auth: 'user'`, `:id` an
`orderRef` like its siblings, answering `{ items: [userCoupon] }` — the same
`userCoupon` 我的优惠券 already returns, so H needs no new mapper. An order that
granted nothing answers `{ items: [] }`, which is the common case and must not
be an error.

If 下单送券 is not a rule this build supports (nothing in the merged contract
mentions it, so it may simply be retired), say so and H will delete the call and
the sheet.

## 2. 店员赠送优惠券

`pages/admin/user/components/coupon/index.vue` is a drawer in 商家管理 → 用户:
the staff member picks a customer (or several, via the list's checkboxes),
opens the drawer, searches the coupons the shop has, and grants one.

Two calls:

- `getUserCoupon({coupon_title, uid})` — the coupons this shop may grant,
  filtered by title. `uid` was legacy's way of excluding ones the customer
  already holds.
- `postUserSetCoupon(uids, couponId)` — grant it. The page passes **an array of
  uids**; one customer is an array of one.

`POST /admin-api/coupons/:id/grants` already does exactly the second one, and
`GET /admin-api/coupons` the first — for an admin session. A 店员 has a shopper
session with a staff role on it, not an admin one.

**Ask:** the staff mirror, `auth: 'staff'`:

```
GET  /api/v1/staff/coupons        ?keyword&uid     -> { items: [coupon] }
POST /api/v1/staff/users/:uid/coupons   { couponId }
```

or, if granting to several customers at once should stay one request,
`POST /api/v1/staff/coupon-grants { couponId, uids[] }`. H is happy with either;
the page loops today only because the legacy route took a list.

Worth deciding with it: whether a 店员 may grant **any** coupon or only ones an
admin marked grantable, and whether the grant is recorded against the staff
member. The admin route's `grants` body is the place that decision already
lives.

## Until then

- `orderCoupon` (`api/order.js`) — `CONTRACT-PENDING(B1)` against
  `GET /api/v1/orders/:id/gift-coupons`. The 支付成功 page renders without the
  sheet, which is what it did whenever the legacy call returned an empty list.
- `getUserCoupon` / `postUserSetCoupon` (`api/admin.js`) —
  `CONTRACT-PENDING(B1)`. The drawer opens empty and 赠送 fails. It is reachable
  only from `pages/admin/user/**`, which is blocked on CR-2-h2 §3 anyway.

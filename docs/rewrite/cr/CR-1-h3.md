# CR-1-h3 — a staff read of one customer's coupons

- **Stream:** H3 (uni-app third pass), raised against the coupon domain (B1/B3)
- **Status:** **RESOLVED** by W5T in `eef7affe3` — yes, a 店员 may read a customer's coupons (orchestrator's decision)
- **Affects:** `next/packages/contracts/src/coupon/coupon.staff.contract.ts`

商家管理 → 用户 → 详情 has two coupon entries. 「赠送优惠券」 is live on B3's
`GET /api/v1/staff/coupons` + `POST /api/v1/staff/coupon-grants`. The other,
「查看优惠券」 (`pages/admin/user/index.vue` `couponSeeTap` →
`components/coupon/index.vue` `userCoupon(2)`), asks what the customer already
holds, and the same page renders a 优惠券 count (`infoData.coupon_num`) in the
detail header. Neither has a route: CR-5-h2 §2 only asked for the grantable
list and the grant, and E4's `staffUserListItem` deliberately carries no coupon
count.

**Ask:** `GET /api/v1/staff/users/:uid/coupons`, `auth: 'staff'`, answering
`{ items: userCoupon[] }` (the storefront 我的优惠券 item, so the uni-app needs
no new mapper) — unused ones first or `?state=unused`, whichever the domain
prefers — and, if cheap, a `couponCount` on the staff user item (or leave the
header at 「--」). Whether a 店员 should see this at all is the coupon domain's
call, the same question E4 answered for phone numbers; "no" is an answer, and
then H deletes the button.

## Until then

- `getUserCoupon({ uid })` (`template/uni-app/api/admin.js`) rejects without a
  request, with 「店员端暂不能查看客户持有的优惠券」: the drawer toasts it and
  shows its empty state rather than passing the shop's grantable coupons off as
  the customer's.
- `toLegacyStaffUser` renders `coupon_num` as 「--」, E4's spelling of unknown.

## Resolution (W5T, `eef7affe3`)

Decision: **yes** — a 店员 already sees the customer and may grant coupons;
reading what they hold is the same trust level.

- `GET /api/v1/staff/users/:uid/coupons` (`coupon.staffUserCoupons`,
  `auth: 'staff'`, no atom — the same door as E4's staff user routes), contract in
  `next/packages/contracts/src/coupon/coupon.staff.contract.ts`, service
  `staffListUserCoupons` in `next/packages/core/src/coupon/coupon.service.ts`,
  route `next/apps/web/app/api/v1/staff/users/[uid]/coupons/route.ts`.
- Answers `{ items: userCoupon[] }` — the storefront 我的优惠券 item and its
  mapper (`toUserCoupon`), not a fork. Without `?state` every coupon, spendable
  (`unused` and inside its window) first, newest first within each half; with
  `?state=unused|used|expired` one wallet tab, filtered by the same predicate
  the wallet uses (extracted as `walletStateFilter` in `coupon.repo.ts`). At most
  100 rows (`STAFF_USER_COUPON_LIMIT`): the drawer does not page.
- An unknown `uid` is `404 USER_NOT_FOUND`, as on `GET /api/v1/staff/users/:uid`.
  The service re-checks `actor.kind === 'staff'` and throws `FORBIDDEN`, so a
  route wired without the guard fails closed.
- `couponCount` on E4's staff user detail: **not added**. The detail item is
  the user domain's (`contracts/src/user`, `core/src/user`, outside W5T), and the
  count would be a second query into the coupon domain's table, not one batched
  query. `coupon_num` stays 「--」.
- uni-app: `getUserCoupon({uid})` reads the new route with
  `toLegacyUserCouponList`; the reject stub is gone.

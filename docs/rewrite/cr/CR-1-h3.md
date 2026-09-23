# CR-1-h3 — a staff read of one customer's coupons

- **Stream:** H3 (uni-app third pass), raised against the coupon domain (B1/B3)
- **Status:** open
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

/**
 * The coupon domain's public surface.
 *
 * CONVENTIONS: "A domain in `core` may import another domain only through that
 * domain's `index.ts`". So this file is the contract between the coupon domain
 * and the rest of the system, and everything not re-exported here is private —
 * `coupon.repo.ts` in particular, which no other domain may reach.
 *
 * The five functions other streams call:
 *
 * | Function          | Caller | When                                          |
 * | ----------------- | ------ | --------------------------------------------- |
 * | `quote`           | B1     | pricing the cart and confirming an order      |
 * | `redeem`          | B1     | inside `createOrder`'s transaction            |
 * | `release`         | B1 / C | cancel and refund                             |
 * | `grantNewUser`    | E1     | inside the registration transaction           |
 * | `grantOrderGifts` | B1 / C | the order-paid effect handler                 |
 *
 * `redeem`, `release`, `grantNewUser` and `grantOrderGifts` take `(tx, ctx, …)`
 * — a transaction the *caller* owns, plus the context they need a clock and a
 * logger from. That argument order matches `recordEffect(tx, ctx, input)`, the
 * platform's other "join the transaction you are already in" primitive.
 */
export {
  // storefront + admin services, called by route files
  adminCreate,
  adminDelete,
  adminDetail,
  adminGrant,
  adminList,
  adminListUserCoupons,
  adminSetStatus,
  adminUpdate,
  claim,
  listApplicable,
  listClaimable,
  listMine,
  listNewUser,
  // the domain API other streams call
  grantNewUser,
  grantOrderGifts,
  quote,
  redeem,
  release,
} from './coupon.service';

export type {
  OrderGiftInput,
  QuoteInput,
  QuoteResult,
  RedeemInput,
  ReleaseInput,
  ReleaseResult,
} from './coupon.service';

export type { CouponLine, CouponTerms } from './coupon.rules';
export { couponPermissions } from './permissions';

/** Jobs reach the sweeps through here; nothing else in `coupon.repo.ts` is public. */
export { expireOverdueCoupons, disableClosedCampaigns } from './coupon.jobs';

import { staffCouponGrant } from '@shop/contracts/coupon/coupon.staff.contract';
import * as coupon from '@shop/core/coupon';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/staff/coupon-grants` — 店员发券.
 *
 * One coupon, one customer, through the admin grant service unchanged, so the
 * supply race and the per-user limit behave the same on both consoles.
 */
export const POST = handle(staffCouponGrant, (ctx, { body }) => {
  ctx.audit(`coupon:${body.couponId}`);
  return coupon.staffGrant(ctx, body);
});

export const dynamic = 'force-dynamic';

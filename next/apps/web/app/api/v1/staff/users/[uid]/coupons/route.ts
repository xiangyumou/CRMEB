import { staffUserCouponList } from '@shop/contracts/coupon/coupon.staff.contract';
import * as coupon from '@shop/core/coupon';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/users/:uid/coupons` — what one customer holds (CR-1-h3). */
export const GET = handle(staffUserCouponList, (ctx, { params, query }) =>
  coupon.staffListUserCoupons(ctx, params, query),
);

export const dynamic = 'force-dynamic';

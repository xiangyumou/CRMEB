import { staffCouponList } from '@shop/contracts/coupon/coupon.staff.contract';
import * as coupon from '@shop/core/coupon';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/coupons` — the active templates a staff member may hand out. */
export const GET = handle(staffCouponList, (ctx, { query }) => coupon.staffListCoupons(ctx, query));

export const dynamic = 'force-dynamic';

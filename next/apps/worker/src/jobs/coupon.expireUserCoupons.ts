import { z } from 'zod';
import { expireOverdueCoupons } from '@shop/core/coupon';
import { defineJob } from '../define-job';

/**
 * Marks wallet coupons whose window has closed as `expired`. Hourly.
 *
 * Nothing depends on it for correctness — every read and the redemption guard
 * filter on the window too — so a missed run cannot let an expired coupon be
 * spent. It exists so the 已过期 tab and the admin list tell the truth.
 *
 * Legacy had no job here at all: it swept the table from inside
 * `getUserValidCouponCount`, so one shopper opening their wallet wrote to
 * every expired row in the database.
 */
export default defineJob({
  name: 'coupon.expireUserCoupons',
  schema: z.object({}).default({}),
  concurrency: 1,
  repeat: { pattern: '7 * * * *' },
  handler: async (ctx) => {
    const expired = await expireOverdueCoupons(ctx);
    if (expired > 0) ctx.logger.info({ expired }, 'expired overdue coupons');
  },
});

import { z } from 'zod';
import { closeExpiredPayments } from '@shop/core/payment';
import { defineJob } from '../define-job';

/**
 * Closes the gateway order of every payment whose window has passed.
 *
 * This is the money half of expiry and it does not cancel anything: cancelling
 * releases stock and coupons, and that is B1's. What this job does is make the
 * payment side *final*, by asking WeChat to close each open attempt and
 * believing only a confirmed answer.
 *
 * It runs at `:01` of every fifth minute, two minutes ahead of
 * `order.sweepExpiredOrders` at `:03`. That gap used to be load-bearing:
 * `PaymentPort.ensureNoOpenAttempts` is database-only — it runs under the
 * order's row lock, so it may not call WeChat — and it answers `unknown` for
 * any order with an open attempt, so before `CR-7-c` an expired order that had
 * ever reached the WeChat sheet could only be swept if this job had closed it
 * first.
 *
 * `CR-7-c` has landed: `cancelOrder` calls `closeOrderPayments` itself, so the
 * schedule is no longer standing in for a function call. The job still earns
 * its place — it makes the payment side final on its own for orders nobody is
 * trying to cancel, and it means the sweep two minutes later usually finds the
 * attempts already closed and makes no gateway call at all.
 */
export default defineJob({
  name: 'payment.closeExpiredPayments',
  schema: z.object({}).default({}),
  concurrency: 1,
  repeat: { pattern: '1/5 * * * *' },
  handler: async (ctx) => {
    const report = await closeExpiredPayments(ctx);
    if (report.examined > 0) ctx.logger.info(report, 'closed expired payment attempts');
  },
});

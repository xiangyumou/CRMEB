import { z } from 'zod';
import { closeExpiredPayments, registerPaymentDomain } from '@shop/core/payment';
import { defineJob } from '../define-job';

/**
 * Registered at import, not in the handler, and that is the whole point.
 *
 * `jobs.gen.ts` imports every job module at boot, so this runs before the first
 * pass of `system.dispatchEffects` — which matters, because an effect claimed
 * before its handler exists is settled as "no handler for payment/…" and parked
 * as `unknown`, permanently, with nothing to un-park it. Registering inside the
 * handler would leave a window of a few seconds after every deploy in which
 * exactly that happens to whatever the ledger is holding.
 *
 * Every registration in this stream is last-write-wins, so repeating it across
 * the job modules of one domain is free and means disabling a job cannot
 * silently take the domain's effect handlers with it. `CR-8-c` asks for the
 * gen'd bootstrap that should be doing this for every domain, in both apps.
 */
registerPaymentDomain();

/**
 * Closes the gateway order of every payment whose window has passed.
 *
 * This is the money half of expiry and it does not cancel anything: cancelling
 * releases stock and coupons, and that is B1's. What this job does is make the
 * payment side *final*, by asking WeChat to close each open attempt and
 * believing only a confirmed answer.
 *
 * It runs at `:01` of every fifth minute, two minutes ahead of
 * `order.sweepExpiredOrders` at `:03`, and the gap is load-bearing until
 * `CR-7-c` lands. `PaymentPort.ensureNoOpenAttempts` is database-only — it runs
 * under the order's row lock, so it may not call WeChat — and it answers
 * `unknown` for any order with an open attempt. B1's `cancelOrder` never calls
 * `closeOrderPayments` first, so without this job running ahead of it, every
 * expired order that ever reached the WeChat sheet would answer
 * `ORDER_PAYMENT_STATE_UNKNOWN` and sit on its stock forever.
 *
 * Ordering by schedule is a poor substitute for a function call, which is what
 * the CR asks for. It is, however, enough to keep the sweep working, because
 * both are backstops with no deadline of their own: an order this pass misses
 * is closed by the next one.
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

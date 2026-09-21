import { z } from 'zod';
import { dispatchEffectsOnce } from '@shop/core/effects';
import { defineJob } from '../define-job';

/**
 * The effects dispatcher, as a repeatable job.
 *
 * Every post-commit side effect in the system — notify WeChat, send an SMS,
 * push a subscription message — is delivered from here. It runs every five
 * seconds rather than in a tight loop so that one slow handler cannot starve
 * the queue, and `concurrency: 1` per process keeps the claim pattern honest;
 * horizontal scale comes from running more worker containers, which
 * `FOR UPDATE SKIP LOCKED` already handles.
 *
 * A pass claims a bounded batch and always returns, so a redeploy never has to
 * wait for an unbounded drain.
 */
export default defineJob({
  name: 'system.dispatchEffects',
  schema: z.object({ batchSize: z.number().int().min(1).max(200).default(50) }).prefault({}),
  concurrency: 1,
  attempts: 1, // the ledger has its own retry policy; a BullMQ retry would double it
  repeat: { every: 5_000 },
  handler: async (ctx, payload) => {
    const report = await dispatchEffectsOnce(ctx, { batchSize: payload.batchSize });
    if (report.claimed > 0) {
      ctx.logger.info(report, 'effects dispatched');
    }
    if (report.parked > 0) {
      ctx.logger.error({ parked: report.parked }, 'effects parked as unknown — needs a human');
    }
  },
});

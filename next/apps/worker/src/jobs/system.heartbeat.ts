import { z } from 'zod';
import { defineJob } from '../define-job';

/**
 * The sample job, and a genuinely useful one: it proves the whole path —
 * scheduler, queue, payload validation, context, Redis — is alive, and it is
 * the smallest possible example for a stream writing its first job.
 *
 * The container healthcheck reads the key the worker's main loop refreshes
 * (`worker:heartbeat`), not this; this one records that *scheduled* jobs are
 * firing, which is a different failure.
 */
export default defineJob({
  name: 'system.heartbeat',
  schema: z.object({}).default({}),
  concurrency: 1,
  repeat: { every: 60_000 },
  handler: async (ctx) => {
    await ctx.redis.set('worker:heartbeat:job', String(ctx.clock.nowMs()), 'EX', 300);
    ctx.logger.debug('heartbeat');
  },
});

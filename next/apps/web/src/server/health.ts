import type { HealthPayload } from '@shop/contracts/health/health.contract';
import type { Ctx } from '@shop/core/kernel';

/**
 * The health payload, shared by both surfaces.
 *
 * Deliberately *shallow*: it answers "is this process up and serving", not "is
 * the whole system well". A healthcheck that touches PostgreSQL and Redis will
 * restart a container because a database failed over, which turns a brief
 * degradation into an outage. Deep checks belong on a separate readiness
 * endpoint that the orchestrator does not act on.
 */
export function healthPayload(ctx: Ctx): HealthPayload {
  return {
    status: 'ok',
    time: ctx.clock.now().toISOString(),
    version: process.env.APP_VERSION ?? 'dev',
  };
}

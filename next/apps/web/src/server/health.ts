import type { HealthPayload, ReadinessPayload } from '@shop/contracts/health/health.contract';
import { DomainError, type Ctx } from '@shop/core/kernel';

/**
 * The health payload, shared by both surfaces.
 *
 * Deliberately *shallow*: it answers "is this process up and serving", not "is
 * the whole system well". A healthcheck that touches PostgreSQL and Redis will
 * restart a container because a database failed over, which turns a brief
 * degradation into an outage. Deep checks belong on a separate readiness
 * endpoint that the orchestrator does not act on — `readinessPayload()` below.
 */
export function healthPayload(ctx: Ctx): HealthPayload {
  return {
    status: 'ok',
    time: ctx.clock.now().toISOString(),
    version: process.env.APP_VERSION ?? 'dev',
  };
}

// ---------------------------------------------------------------------------
// Readiness (CR-1-j2)
// ---------------------------------------------------------------------------

/** Never let one hung dependency hold the whole probe open. */
const READY_TIMEOUT_MS = 2000;

/**
 * How many migrations `packages/db` ships at the commit this image was built
 * from.
 *
 * A constant rather than an import: the standalone web bundle does not carry
 * `packages/db/migrations` — the worker image runs the migrator, the web image
 * only has to know what to expect. `health.test.ts` reads the drizzle journal
 * off disk and fails when this number drifts, so adding a migration and
 * forgetting this line is a merge-gate failure rather than a surprise during a
 * release.
 */
export const EXPECTED_MIGRATIONS = 2;

/** The key the worker refreshes from the same loop that runs the jobs. */
const HEARTBEAT_KEY = 'worker:heartbeat';

/**
 * Two missed beats is a wedged loop; one is a slow tick. Same default, same
 * environment variables and the same reasoning as the worker image's own probe
 * (`next/docker/healthcheck/worker.mjs`), so the two cannot disagree about what
 * a live worker is.
 */
function heartbeatMaxAgeMs(): number {
  const interval = Number(process.env.HEARTBEAT_INTERVAL_MS ?? '15000');
  const fallback = (Number.isFinite(interval) ? interval : 15_000) * 3;
  const configured = Number(process.env.HEARTBEAT_MAX_AGE_MS ?? String(fallback));
  return Number.isFinite(configured) ? configured : fallback;
}

/**
 * A probe that never answers is indistinguishable from one that answers
 * "down", and it costs a connection every time it is retried.
 */
async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('timed out'));
        }, READY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function settled(check: () => Promise<unknown>): Promise<'ok' | 'failed'> {
  try {
    await within(check());
    return 'ok';
  } catch {
    return 'failed';
  }
}

/**
 * Deep readiness. Unlike `healthPayload`, this one is allowed to touch things —
 * because nothing restarts a container on its say-so. It gates a *release*
 * (`deploy/next/upgrade.sh` through `deploy/next/lib/readiness.sh`) and it
 * answers a monitor; the container healthchecks keep calling `/api/v1/health`,
 * which touches nothing.
 *
 * Four checks, and **no error text, host, connection string or credential** in
 * the body: every failure is the bare word `failed` beside the dependency's
 * name. This endpoint is reachable by anyone who can reach the site, so what it
 * says has to be safe for all of them (OPS-003).
 */
export async function readinessPayload(ctx: Ctx): Promise<ReadinessPayload> {
  // Plain strings rather than drizzle's `sql` template: `apps/web` does not
  // depend on `drizzle-orm` — CONVENTIONS keeps Drizzle behind `*.repo.ts` —
  // and there is nothing to interpolate here. Two fixed literals need no
  // query builder and buy the app no new dependency.
  const [database, redis, migrations, worker] = await Promise.all([
    settled(() => ctx.db.execute('select 1')),
    settled(() => ctx.redis.ping()),
    // Not "is the table there", and not "has anything been applied": the schema
    // has to be at least the one this build was compiled against. An empty
    // migrations table is a database that was created and never migrated,
    // which is exactly the state a first deploy can leave behind.
    //
    // `>=` and not `=`, deliberately. A rollback puts the previous image in
    // front of the newer schema and OPS-007 depends on that stack serving;
    // migrations are additive, so a database ahead of the image is ready.
    settled(async () => {
      const result = await ctx.db.execute<{ n: number }>(
        'select count(*)::int as n from drizzle.__drizzle_migrations',
      );
      const applied = result.rows[0]?.n ?? 0;
      if (applied < EXPECTED_MIGRATIONS) {
        throw new Error(`${applied} migration(s) applied, expected ${EXPECTED_MIGRATIONS}`);
      }
    }),
    // The heartbeat is written from the same event loop that runs the jobs and
    // deleted before draining on SIGTERM, so this asks "are jobs being
    // consumed", not "is a process alive". A web that serves while nothing
    // drains the queue looks well and quietly stops paying, shipping and
    // refunding.
    settled(async () => {
      const beat = await ctx.redis.get(HEARTBEAT_KEY);
      if (beat === null) throw new Error('no heartbeat');
      const age = ctx.clock.nowMs() - Number(beat);
      if (!Number.isFinite(age)) throw new Error('the heartbeat is not a timestamp');
      const maxAge = heartbeatMaxAgeMs();
      // A clock running backwards is a real fault, not a healthy worker.
      if (age > maxAge || age < -maxAge) throw new Error('the heartbeat is stale');
    }),
  ]);

  const checks = { database, redis, migrations, worker } as const;
  if (Object.values(checks).some((value) => value !== 'ok')) {
    throw new DomainError('HEALTH_NOT_READY', { details: { checks } });
  }
  return {
    status: 'ok',
    time: ctx.clock.now().toISOString(),
    version: process.env.APP_VERSION ?? 'dev',
    checks,
  };
}

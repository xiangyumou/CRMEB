# CR-1-j2 — `/readyz` in `apps/web`: the deep check has no HTTP surface

**Status (R5 sweep, 2026-09-23): RESOLVED** — `GET /api/v1/readyz` exists (J3, `d88065849`). The status line below is kept as history.

**Stream** J2 (container images and deployment) · **Against** `next/apps/web/**`
and `next/packages/contracts/src/health/` · **Status** open · **Blocking** no
(the stack ships and the gate works without it)

## What

The J2 brief says the web app exposes `/healthz` and `/readyz`. It does not.
`apps/web` has exactly two health endpoints, both shallow by design and both
inside the contract system:

- `GET /api/v1/health` → `apps/web/app/api/v1/health/route.ts`
- `GET /admin-api/health` → `apps/web/app/admin-api/health/route.ts`

Both return `healthPayload(ctx)` from `apps/web/src/server/health.ts`, which is
`{status, time, version}` and touches nothing. Its docstring is right about why:

> A healthcheck that touches PostgreSQL and Redis will restart a container
> because a database failed over, which turns a brief degradation into an
> outage. Deep checks belong on a separate readiness endpoint that the
> orchestrator does not act on.

That separate endpoint was never built. And it cannot simply be added at
`/readyz`, because `defineRoute`
(`packages/contracts/src/_conventions/route.ts`) rejects any path that does not
start with `/admin-api/` or `/api/v1/`, and CONVENTIONS.md §Contracts says
"Every endpoint is a `defineRoute({...})`". So the deep readiness check has no
home in the app as the conventions stand.

The consequence today: `deploy/next/lib/readiness.sh` reaches into containers —
`compose exec postgres psql …` for the schema and `compose exec worker node
/app/healthcheck.mjs` for the heartbeat. That works for a release gate run from
the host, and it is useless to anything that can only make an HTTP request: a
smoke test in CI, an uptime monitor, a future load balancer, or anyone
debugging from outside the box.

## Proposed change

A `/api/v1/readyz` contract route, with nginx mapping the ops-conventional
`/readyz` onto it. Three files, all additive; nothing existing changes.

**1. `packages/contracts/src/health/errors.ts`** (new)

```ts
import { defineErrors } from '../_conventions/errors';

/**
 * Readiness has exactly one failure: not ready. Which check failed is
 * `details`, not a separate code — a monitor branches on "can this serve", and
 * a human reads the detail.
 */
export const healthErrors = defineErrors({
  /**
   * 503 rather than 500: the process is fine and answering, the dependency it
   * needs is not. A 500 would tell a load balancer to take the pod out; a 503
   * tells it to stop sending traffic, which is what this means.
   */
  HEALTH_NOT_READY: { status: 503, message: '服务尚未就绪' },
});
```

**2. `packages/contracts/src/health/health.contract.ts`** (append)

```ts
const checkResult = z.enum(['ok', 'failed']);

export const readinessPayload = z.object({
  status: z.literal('ok'),
  time: instant,
  version: z.string(),
  /** One entry per dependency this process needs before it can serve. */
  checks: z.object({
    database: checkResult,
    redis: checkResult,
    migrations: checkResult,
  }),
});
export type ReadinessPayload = z.infer<typeof readinessPayload>;

export const storefrontReadiness = defineRoute({
  id: 'health.readiness',
  method: 'GET',
  path: '/api/v1/readyz',
  // Public for the same reason `/api/v1/health` is: the caller is a probe and
  // has no session. It returns no data an attacker does not already have by
  // watching whether the site works.
  auth: 'public',
  summary: '就绪检查（深度）',
  tags: ['health'],
  response: readinessPayload,
  errors: ['HEALTH_NOT_READY'],
  examples: [
    {
      name: 'ready',
      response: {
        status: 'ok',
        time: '2026-01-01T12:00:00+08:00',
        version: 'dev',
        checks: { database: 'ok', redis: 'ok', migrations: 'ok' },
      },
    },
  ],
});
```

(If `defineRoute`'s option is named something other than `errors`, use whatever
`coupon`/`order` already spell; this CR is about the endpoint, not the key.)

**3. `apps/web/src/server/health.ts`** (append) — the logic, so `route.ts` stays
a one-liner per the import-boundary rule.

```ts
import { sql } from 'drizzle-orm';
import { DomainError } from '@shop/core/kernel';
import type { ReadinessPayload } from '@shop/contracts/health/health.contract';

const READY_TIMEOUT_MS = 2000;

/** Never let a hung dependency hang the probe: a probe that never answers is
 *  indistinguishable from one that answers "down", and costs a connection. */
async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), READY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const settled = async (check: () => Promise<unknown>): Promise<'ok' | 'failed'> => {
  try {
    await within(check());
    return 'ok';
  } catch {
    return 'failed';
  }
};

/**
 * Deep readiness. Unlike `healthPayload`, this one is allowed to touch things —
 * because nothing restarts a container on its say-so. It gates a *release*
 * (`deploy/next/upgrade.sh`) and answers a monitor; the container healthcheck
 * keeps calling `/api/v1/health`, which touches nothing.
 */
export async function readinessPayload(ctx: Ctx): Promise<ReadinessPayload> {
  const [database, redis, migrations] = await Promise.all([
    settled(() => ctx.db.execute(sql`select 1`)),
    settled(() => ctx.redis.ping()),
    // Not "is the table there" but "has anything been applied": an empty
    // migrations table is a database that was created and never migrated,
    // which is exactly the state a first deploy can leave behind.
    settled(async () => {
      const result = await ctx.db.execute<{ n: number }>(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      const rows = (result as unknown as { rows?: { n: number }[] }).rows ?? [];
      if (!rows[0] || rows[0].n < 1) throw new Error('no migration applied');
    }),
  ]);

  const checks = { database, redis, migrations } as const;
  if (Object.values(checks).some((value) => value !== 'ok')) {
    throw new DomainError('HEALTH_NOT_READY', { details: { checks } });
  }
  return { status: 'ok', time: ctx.clock.now().toISOString(), version: process.env.APP_VERSION ?? 'dev', checks };
}
```

**4. `apps/web/app/api/v1/readyz/route.ts`** (new)

```ts
import { storefrontReadiness } from '@shop/contracts/health/health.contract';
import { handle } from '../../../../src/server';
import { readinessPayload } from '../../../../src/server/health';

/** Deep readiness. Public by contract; see `src/server/health.ts` for why this
 *  one may touch the database while `/api/v1/health` may not. */
export const GET = handle(storefrontReadiness, (ctx) => readinessPayload(ctx));

export const dynamic = 'force-dynamic';
```

**5. J2 applies the one-line edge change** — `next/docker/edge/nginx.conf`
already has the location and the comment:

```nginx
location = /readyz {
-    proxy_pass http://web/api/v1/health;
+    proxy_pass http://web/api/v1/readyz;
```

**Two notes for whoever takes this.**

- `handle()` must not count a 503 from this route as an error-rate signal or
  log it at `error` — a probe firing every few seconds against a starting
  database would fill the log with the thing it is there to report quietly.
- Stream K's guards: if a guard is added that requires every `defineRoute` to
  carry a `permission` or to appear in a permission matrix, `health.readiness`
  belongs on the same exception list as `health.storefront` and `health.admin`,
  for the same reason (the caller is a probe and has no session).

## Why not a bare `app/readyz/route.ts`

It is four lines shorter and breaks two rules to save them: it would be the
only HTTP endpoint in the app not described by a contract, so it would be
missing from the OpenAPI document, from the generated client and from the
example checker — and the next person adding an ops endpoint would cite it.
Relaxing `defineRoute` to allow an `/ops/` prefix is the other honest option,
but it widens the convention for one route. `/api/v1/readyz` + one `proxy_pass`
costs nothing and keeps both rules.

## Workaround in place

The edge owns both names today and the deep check runs from the host:

- `/healthz` — answered by nginx itself (`return 200 "ok\n"`), so a slow app
  cannot take the edge's own liveness probe down with it. This one stays as it
  is even after this CR lands; it is not an app concern.
- `/readyz` — proxied to `/api/v1/health`, i.e. it currently proves the Next
  server is serving and nothing more.
- the deep check — `deploy/next/lib/readiness.sh`, run by `upgrade.sh` and by
  `deploy/next/readyz.sh`. It queries `drizzle.__drizzle_migrations` and the
  tables a release needs through `compose exec postgres psql`, and runs the
  worker image's own probe through `compose exec worker`.

When this CR lands, `readiness.sh` keeps its queries as a second opinion — an
endpoint that reports itself ready is worth checking against the database
directly at the moment of a release — and the `proxy_pass` line changes.

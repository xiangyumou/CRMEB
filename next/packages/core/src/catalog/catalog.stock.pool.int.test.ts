import { createDb } from '@shop/db';
import { createTestCtx, forkTestCtx, type TestCtx } from '@shop/testing';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminActor, firstSkuId, makeAdmin, makeProduct } from './catalog.fixtures.repo';
import { catalogStockPort } from './catalog.stock';

/**
 * CR-53-k2. STAB-001 round 3 hung for good in
 * `order.concurrency.int.test.ts > sells ten units to exactly ten of twelve
 * buyers`. The database showed why. One backend was `idle in transaction`
 * holding the SKU row lock, right after `rollupProduct`. The other eleven were
 * blocked on that lock. Twelve connections is the harness pool's `max`.
 *
 * `catalogStockPort.reserve(tx, …, ctx)` takes the SKU row lock, then calls
 * `warnOnLowStock`, which calls `ctx.config.get(catalogConfig)`. That read is
 * **not** on `tx`. On a cache miss it takes a second connection from the pool.
 * The config cache TTL is five minutes, so a miss is routine. With `max`
 * transactions in flight on one SKU, every connection is held by a transaction
 * waiting on the lock. The lock holder waits for a connection that can only
 * come back when it commits, and it never does. `pg.Pool` has no acquire
 * timeout and nothing sets `idle_in_transaction_session_timeout`, so the pool
 * stays wedged.
 *
 * In production the web pool is `DB_POOL_MAX` 10. Ten checkouts of one SKU
 * landing in the same moment as a cache expiry wedge the web process. That is
 * the flash-sale case the stock guard exists for.
 *
 * This file makes it deterministic with a pool of three and three reservers.
 * The holder's config-cache read is held until the other two are blocked on
 * the row lock. It is pinned `it.fails` until the read happens before the lock
 * or on `tx`.
 */

let harness: TestCtx;

const NOW = '2026-06-01T00:00:00.000Z';
const POOL_MAX = 3;
const APP_NAME = 'k2-pool-starvation';
const DEADLOCK_AFTER_MS = 8_000;

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);
});

/** Backends of the small pool that are blocked on a lock. */
async function blockedOnLock(): Promise<number> {
  const result = await harness.ctx.db.execute<{ n: string }>(
    sql`select count(*)::text as n from pg_stat_activity
        where datname = current_database() and application_name = ${APP_NAME}
          and wait_event_type = 'Lock'`,
  );
  return Number(result.rows[0]!.n);
}

/**
 * The harness's Redis, except that the first read of the catalog config cache
 * waits until `waiters` other reservers are blocked on the row lock. That is
 * the schedule a burst of checkouts produces by chance.
 */
function redisHoldingFirstConfigRead(redis: Redis, waiters: number): Redis {
  let armed = true;
  return new Proxy(redis, {
    get(target, prop) {
      if (prop === 'get') {
        return async (key: string) => {
          if (armed && key === 'config:catalog') {
            armed = false;
            const deadline = Date.now() + DEADLOCK_AFTER_MS;
            while ((await blockedOnLock()) < waiters && Date.now() < deadline) {
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
          }
          return target.get(key);
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

describe('CR-53-k2 — a stock reservation never needs a second pooled connection', () => {
  it.fails(
    'lets pool-max reservers of one SKU all finish when the config cache is cold',
    async () => {
      const admin = harness.as(adminActor(await makeAdmin(harness)));
      const product = await makeProduct(admin);
      const skuId = await firstSkuId(harness, product.id);

      const url = new URL(harness.db.url);
      url.searchParams.set('application_name', APP_NAME);
      const small = createDb(url.toString(), { max: POOL_MAX });
      // The terminations below are ours; a pooled client reporting them is noise.
      small.pool.on('error', () => {});
      small.pool.on('connect', (client) => client.on('error', () => {}));
      const redis = redisHoldingFirstConfigRead(harness.redis, POOL_MAX - 1);
      const base = { ...harness, redis, db: { ...harness.db, db: small.db } } as TestCtx;

      const reservations = Array.from({ length: POOL_MAX }, (_, index) => {
        const ctx = forkTestCtx(base, { requestId: `reserve-${index}` });
        return ctx.withTx((tx) =>
          catalogStockPort.reserve(tx, 9000 + index, [{ skuId, quantity: 1 }], ctx),
        );
      });

      let timer: NodeJS.Timeout | undefined;
      const outcome = await Promise.race([
        Promise.allSettled(reservations).then(() => 'finished' as const),
        new Promise<'wedged'>((resolve) => {
          timer = setTimeout(() => resolve('wedged'), DEADLOCK_AFTER_MS * 2);
        }),
      ]);
      clearTimeout(timer);

      // Free the wedged sessions either way, so the file can tear down.
      await harness.ctx.db.execute(
        sql`select pg_terminate_backend(pid) from pg_stat_activity
          where datname = current_database() and application_name = ${APP_NAME}`,
      );
      await Promise.allSettled(reservations);
      await small.close().catch(() => {});

      expect(outcome).toBe('finished');
    },
  );
});

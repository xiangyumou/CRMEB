import { createDb, type DbHandle } from '@shop/db';
import {
  createConfigService,
  createCtx,
  createLocalStorage,
  createLogger,
  noopQueue,
  systemActor,
  systemClock,
  type ConfigCache,
  type Ctx,
} from '@shop/core/kernel';
import { createBullQueue } from '@shop/core/kernel/queue-bullmq';
import Redis from 'ioredis';
import { loadEnv, type Env } from './env';

/**
 * The worker's container. Same pieces as the web app's, built once at boot —
 * a job gets the same `Ctx` a request does, which is what lets a service be
 * called from either side without knowing the difference.
 *
 * The actor is `system`: a job acts for the shop, not for a person, and
 * bypasses permission checks. A job acting *on behalf of* a user calls
 * `ctx.as(userActor)`.
 */

export interface WorkerContainer {
  env: Env;
  ctx: Ctx;
  dbHandle: DbHandle;
  redis: Redis;
  /** A second connection: BullMQ blocks on its own, and must not share. */
  queueRedis: Redis;
  close(): Promise<void>;
}

function asConfigCache(redis: Redis): ConfigCache {
  return {
    get: (key) => redis.get(key),
    set: (key, value, _mode, ttl) => redis.set(key, value, 'PX', ttl),
    del: (...keys) => redis.del(...keys),
    publish: (channel, message) => redis.publish(channel, message),
  };
}

export function buildWorkerContainer(env: Env = loadEnv()): WorkerContainer {
  const dbHandle = createDb(env.DATABASE_URL, { max: env.DB_POOL_MAX });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queueRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const logger = createLogger({
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY,
    base: { app: 'worker' },
  });
  const clock = systemClock;

  const ctx = createCtx({
    db: dbHandle.db,
    redis,
    clock,
    config: createConfigService({ db: dbHandle.db, cache: asConfigCache(redis), clock }),
    logger,
    // A job that enqueues another job gets a real queue; the default is a
    // no-op so a misconfigured process fails visibly rather than silently
    // dropping work.
    queue: createBullQueue({ connection: queueRedis, queueName: env.QUEUE_NAME }) ?? noopQueue,
    storage: createLocalStorage({
      root: env.UPLOADS_DIR,
      publicPrefix: env.UPLOADS_PUBLIC_PREFIX,
      now: () => clock.now(),
    }),
    actor: systemActor,
    platform: null,
    requestId: 'worker',
  });

  return {
    env,
    ctx,
    dbHandle,
    redis,
    queueRedis,
    async close() {
      await dbHandle.close();
      redis.disconnect();
      queueRedis.disconnect();
    },
  };
}

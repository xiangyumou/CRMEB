import { createDb, type Db, type DbHandle } from '@shop/db';
import {
  createConfigService,
  createLocalStorage,
  createLogger,
  systemClock,
  type Clock,
  type ConfigCache,
  type ConfigService,
  type JobQueue,
  type Logger,
  type Storage,
} from '@shop/core/kernel';
import { createBullQueue } from '@shop/core/kernel/queue-bullmq';
import { AdminAuthService, UserSessionService } from '@shop/core/auth';
import Redis from 'ioredis';
import { loadEnv, type Env } from './env';

/**
 * Process-wide singletons.
 *
 * Next.js re-evaluates route modules a lot in development; a connection pool
 * per evaluation exhausts PostgreSQL in about a minute. The container is
 * therefore memoised on `globalThis`, which is the only thing that survives a
 * hot reload.
 *
 * Nothing here is imported by `packages/core`: services take the pieces they
 * need through `Ctx`, so a test builds its own container and never has to
 * monkey-patch this module.
 */

export interface Container {
  env: Env;
  dbHandle: DbHandle;
  db: Db;
  redis: Redis;
  clock: Clock;
  logger: Logger;
  queue: JobQueue;
  storage: Storage;
  config: ConfigService;
  adminAuth: AdminAuthService;
  userSessions: UserSessionService;
  close(): Promise<void>;
}

const CONTAINER_KEY = Symbol.for('shop.web.container');

type GlobalWithContainer = typeof globalThis & { [CONTAINER_KEY]?: Container };

function asConfigCache(redis: Redis): ConfigCache {
  return {
    get: (key) => redis.get(key),
    set: (key, value, _mode, ttl) => redis.set(key, value, 'PX', ttl),
    del: (...keys) => redis.del(...keys),
    publish: (channel, message) => redis.publish(channel, message),
  };
}

export function buildContainer(env: Env = loadEnv()): Container {
  const dbHandle = createDb(env.DATABASE_URL, { max: env.DB_POOL_MAX });
  const redis = new Redis(env.REDIS_URL, {
    // BullMQ requires this, and a request that is waiting on Redis should fail
    // fast rather than retry behind the user's back.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY });
  const clock = systemClock;
  const queue = createBullQueue({ connection: redis, queueName: env.QUEUE_NAME });
  const storage = createLocalStorage({
    root: env.UPLOADS_DIR,
    publicPrefix: env.UPLOADS_PUBLIC_PREFIX,
    now: () => clock.now(),
  });
  const config = createConfigService({ db: dbHandle.db, cache: asConfigCache(redis), clock });

  return {
    env,
    dbHandle,
    db: dbHandle.db,
    redis,
    clock,
    logger,
    queue,
    storage,
    config,
    adminAuth: new AdminAuthService({ redis }),
    userSessions: new UserSessionService(),
    async close() {
      await dbHandle.close();
      redis.disconnect();
    },
  };
}

/** The memoised container. Every route handler goes through this. */
export function getContainer(): Container {
  const global = globalThis as GlobalWithContainer;
  const existing = global[CONTAINER_KEY];
  if (existing) return existing;
  const container = buildContainer();
  global[CONTAINER_KEY] = container;
  return container;
}

/** Test helper: install a container built by the harness. */
export function setContainer(container: Container | undefined): void {
  const global = globalThis as GlobalWithContainer;
  if (container === undefined) delete global[CONTAINER_KEY];
  else global[CONTAINER_KEY] = container;
}

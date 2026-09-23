import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminAuthService, UserSessionService } from '@shop/core/auth';
import { createPage, savePageContent, setHomePage } from '@shop/core/diy';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { setContainer, type Container } from '../../../../src/server/container';
import type { Env } from '../../../../src/server/env';

/**
 * `GET /api/v1/diy/pages/home` answering `If-None-Match` (CR-1-s, the second
 * half of CR-42-k2).
 *
 * The payload is cached for 60 s and dropped by every 装修 write (R4); what is
 * proved here is the HTTP half: a caller holding the current version gets a
 * bodyless 304 with the same weak tag, the answer comes from the cached entry
 * without reading the row, and a publish makes the old tag stale at once.
 */

let harness: TestCtx;

const ORIGIN = 'https://shop.example';

const env: Env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  REDIS_URL: 'unused',
  UPLOADS_DIR: '/tmp/uploads',
  UPLOADS_PUBLIC_PREFIX: '/uploads',
  APP_ORIGIN: ORIGIN,
  EXTRA_ALLOWED_ORIGINS: [],
  LOG_LEVEL: 'silent',
  LOG_PRETTY: false,
  VALIDATE_RESPONSES: true,
  DB_POOL_MAX: 5,
  QUEUE_NAME: 'shop',
  APP_VERSION: 'test',
};

beforeAll(async () => {
  harness = await createTestCtx({ now: '2026-06-01T00:00:00.000Z', platform: 'h5' });
  const container: Container = {
    env,
    dbHandle: harness.db.handle,
    db: harness.ctx.db,
    redis: harness.redis,
    clock: harness.clock,
    logger: harness.ctx.logger,
    queue: harness.ctx.queue,
    storage: harness.ctx.storage,
    config: harness.ctx.config,
    adminAuth: new AdminAuthService(harness.ctx, { bcryptCost: 4 }),
    userSessions: new UserSessionService(),
    close: async () => {},
  };
  setContainer(container);
}, 180_000);

afterAll(async () => {
  setContainer(undefined);
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
});

async function seedHome() {
  const page = await createPage(harness.ctx, { name: '首页', kind: 'home', title: '商城首页' });
  await setHomePage(harness.ctx, { id: page.id });
  return page;
}

async function read(headers: Record<string, string> = {}) {
  const { GET } = await import('./pages/home/route');
  return GET(new Request(`${ORIGIN}/api/v1/diy/pages/home`, { headers }));
}

describe('GET /api/v1/diy/pages/home — conditional (CR-1-s)', () => {
  it('sends the page and its weak tag to a caller that has nothing', async () => {
    await seedHome();
    const response = await read();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { version: string };
    expect(response.headers.get('etag')).toBe(`W/"${body.version}"`);
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('answers a caller holding the current version with a bodyless 304', async () => {
    await seedHome();
    const tag = (await read()).headers.get('etag')!;

    for (const offered of [tag, tag.replace(/^W\//, '')]) {
      const response = await read({ 'if-none-match': offered });
      expect(response.status, offered).toBe(304);
      expect(await response.text()).toBe('');
      expect(response.headers.get('etag')).toBe(tag);
    }
  });

  it('answers the 304 from the cached entry, without reading the row', async () => {
    await seedHome();
    const tag = (await read()).headers.get('etag')!;

    // Behind the service's back, so nothing drops the cache: were the row
    // read, there would be no home page and the answer would be a 404.
    await harness.db.handle.pool.query('update diy_pages set is_home = false');

    expect((await read({ 'if-none-match': tag })).status).toBe(304);
  });

  it('sends the new page to a caller holding the version before a publish', async () => {
    const page = await seedHome();
    const before = (await read()).headers.get('etag')!;

    harness.clock.advance(1_000);
    await savePageContent(harness.ctx, { id: page.id, content: {}, publish: true });

    const response = await read({ 'if-none-match': before });
    expect(response.status).toBe(200);
    const after = response.headers.get('etag');
    expect(after).not.toBe(before);
    expect(after).toBe(`W/"${((await response.json()) as { version: string }).version}"`);
  });
});

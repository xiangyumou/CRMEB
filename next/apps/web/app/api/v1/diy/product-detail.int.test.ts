import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_DETAIL_DEFAULT_VALUE } from '@shop/contracts/diy/product-detail.default';
import { AdminAuthService, UserSessionService } from '@shop/core/auth';
import { createPage, savePageContent } from '@shop/core/diy';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { setContainer, type Container } from '../../../../src/server/container';
import type { Env } from '../../../../src/server/env';

/**
 * `GET /api/v1/diy/pages/product-detail` as HTTP (CR-2-h3).
 *
 * The domain behaviour — default when nothing is published, a draft ignored,
 * the newest published page wins — is pinned down in
 * `packages/core/src/diy/diy.int.test.ts`. What is proved here is what only
 * the route can get wrong: that the fixed segment is bound (and not swallowed
 * by the sibling `pages/[id]`), that it is public, that both answers pass the
 * contract with response validation on, and that the ETag the app polls with
 * is set.
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

const get = (path: string) => new Request(`${ORIGIN}${path}`);

async function read() {
  const { GET } = await import('./pages/product-detail/route');
  const response = await GET(get('/api/v1/diy/pages/product-detail'));
  return { response, body: (await response.json()) as Record<string, unknown> };
}

describe('GET /api/v1/diy/pages/product-detail', () => {
  it('answers the built-in default without a session', async () => {
    const { response, body } = await read();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: null, kind: 'product_detail', name: '商品详情' });
    expect(body.content).toEqual(PRODUCT_DETAIL_DEFAULT_VALUE);
    expect(response.headers.get('etag')).toBe(`W/"${String(body.version)}"`);
  });

  it('answers the published page once there is one', async () => {
    const page = await createPage(harness.ctx, {
      name: '商品详情',
      kind: 'product_detail',
      title: '详情',
    });
    // An operator who kept only 图文详情: one real node out of the default.
    const content = Object.fromEntries(
      Object.entries(PRODUCT_DETAIL_DEFAULT_VALUE).filter(
        ([, node]) => (node as { name?: string }).name === 'productDesc',
      ),
    );
    await savePageContent(harness.ctx, { id: page.id, content, publish: true });

    const { response, body } = await read();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: page.id, kind: 'product_detail', title: '详情' });
    expect(body.content).toEqual(content);
    expect(response.headers.get('etag')).toBe(`W/"${String(body.version)}"`);
  });
});

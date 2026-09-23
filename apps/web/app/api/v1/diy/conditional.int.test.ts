import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminAuthService, UserSessionService } from '@shop/core/auth';
import {
  activateTheme,
  createPage,
  diyConfig,
  listThemes,
  savePageContent,
  setHomePage,
  updateTheme,
} from '@shop/core/diy';
import { themes } from '@shop/db/schema/diy';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { setContainer, type Container } from '../../../../src/server/container';
import type { Env } from '../../../../src/server/env';

/**
 * The storefront 装修 reads other than the home page, answering
 * `If-None-Match`.
 *
 * Each is proved the same three ways: a caller with nothing gets a 200 and a
 * weak tag; a caller holding that tag gets a bodyless 304 carrying it; and
 * once the data behind the answer changes, the same caller gets a 200 and a
 * new tag. The third is the one that matters — a validator that did not move
 * with the payload would pin a shopper to a stale page with no way out.
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

type Get = (
  request: Request,
  context?: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/** Reads `path` through `GET`, optionally offering a tag. */
function reader(GET: Get, path: string, params?: Record<string, string>) {
  return (headers: Record<string, string> = {}) =>
    GET(
      new Request(`${ORIGIN}${path}`, { headers }),
      params ? { params: Promise.resolve(params) } : undefined,
    );
}

/**
 * The three answers every conditional read owes. `change` alters what the
 * route answers from; the clock moves first, as it would between two saves.
 */
async function provesConditional(
  read: (headers?: Record<string, string>) => Promise<Response>,
  change: () => Promise<unknown>,
): Promise<{ before: unknown; after: unknown }> {
  const first = await read();
  expect(first.status).toBe(200);
  const tag = first.headers.get('etag');
  expect(tag).toMatch(/^W\/".+"$/);
  expect(first.headers.get('cache-control')).toBe('no-cache');
  const before: unknown = await first.json();

  for (const offered of [tag!, tag!.replace(/^W\//, '')]) {
    const again = await read({ 'if-none-match': offered });
    expect(again.status, offered).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('etag')).toBe(tag);
  }

  harness.clock.advance(1_000);
  await change();

  const changed = await read({ 'if-none-match': tag! });
  expect(changed.status).toBe(200);
  const fresh = changed.headers.get('etag');
  expect(fresh).toMatch(/^W\/".+"$/);
  expect(fresh).not.toBe(tag);
  const after: unknown = await changed.json();

  // And the new tag is itself honoured.
  expect((await read({ 'if-none-match': fresh! })).status).toBe(304);
  return { before, after };
}

const versionOf = (body: unknown) => (body as { version: string }).version;

async function publishedPage(kind: 'home' | 'user_center' | 'micro') {
  const page = await createPage(harness.ctx, { name: kind, kind, title: kind });
  await savePageContent(harness.ctx, { id: page.id, content: {}, publish: true });
  if (kind === 'home') await setHomePage(harness.ctx, { id: page.id });
  return page;
}

const republish = (id: string) => savePageContent(harness.ctx, { id, content: {}, publish: true });

describe('GET /api/v1/diy/pages/:id', () => {
  it('answers 304 until the page is saved again', async () => {
    const page = await publishedPage('micro');
    const { GET } = await import('./pages/[id]/route');
    const read = reader(GET, `/api/v1/diy/pages/${page.id}`, { id: page.id });

    const { before, after } = await provesConditional(read, () => republish(page.id));
    expect(versionOf(after)).not.toBe(versionOf(before));
  });
});

describe('GET /api/v1/diy/pages/user-center', () => {
  it('answers 304 until the page is saved again', async () => {
    const page = await publishedPage('user_center');
    const { GET } = await import('./pages/user-center/route');

    await provesConditional(reader(GET, '/api/v1/diy/pages/user-center'), () => republish(page.id));
  });

  it('moves off the built-in default once a page is published', async () => {
    const { GET } = await import('./pages/user-center/route');

    const { before, after } = await provesConditional(
      reader(GET, '/api/v1/diy/pages/user-center'),
      async () => {
        const page = await createPage(harness.ctx, {
          name: '个人中心',
          kind: 'user_center',
          title: '我的',
        });
        await savePageContent(harness.ctx, { id: page.id, content: {}, publish: true });
      },
    );
    expect(before).toMatchObject({ id: null });
    expect(after).not.toMatchObject({ id: null });
  });
});

describe('GET /api/v1/diy/pages/product-detail', () => {
  it('moves off the built-in default once a page is published', async () => {
    const { GET } = await import('./pages/product-detail/route');

    const { before, after } = await provesConditional(
      reader(GET, '/api/v1/diy/pages/product-detail'),
      async () => {
        const page = await createPage(harness.ctx, {
          name: '商品详情',
          kind: 'product_detail',
          title: '详情',
        });
        await savePageContent(harness.ctx, { id: page.id, content: {}, publish: true });
      },
    );
    expect(before).toMatchObject({ id: null });
    expect(after).not.toMatchObject({ id: null });
  });
});

describe('GET /api/v1/diy/navigation', () => {
  it('answers 304 until the home page is saved again', async () => {
    const home = await publishedPage('home');
    const { GET } = await import('./navigation/route');

    await provesConditional(reader(GET, '/api/v1/diy/navigation'), () => republish(home.id));
  });
});

describe('GET /api/v1/diy/version', () => {
  it('answers 304 for the home page until it is saved again', async () => {
    const home = await publishedPage('home');
    const { GET } = await import('./version/route');

    const { before, after } = await provesConditional(reader(GET, '/api/v1/diy/version'), () =>
      republish(home.id),
    );
    expect(versionOf(after)).not.toBe(versionOf(before));
  });

  it('answers 304 for a page by id until it is saved again', async () => {
    const page = await publishedPage('micro');
    const { GET } = await import('./version/route');

    await provesConditional(reader(GET, `/api/v1/diy/version?id=${page.id}`), () =>
      republish(page.id),
    );
  });
});

describe('GET /api/v1/diy/theme', () => {
  async function seedThemes() {
    const now = harness.clock.now();
    await harness.db.db.insert(themes).values([
      { name: '默认', kind: 'custom', isActive: true, data: {}, createdAt: now, updatedAt: now },
      { name: '节日', kind: 'custom', isActive: false, data: {}, createdAt: now, updatedAt: now },
    ]);
    return (await listThemes(harness.ctx)).items;
  }

  it('answers 304 until the active theme’s tokens change', async () => {
    const [active] = await seedThemes();
    const { GET } = await import('./theme/route');

    const { after } = await provesConditional(reader(GET, '/api/v1/diy/theme'), () =>
      updateTheme(harness.ctx, { id: active!.id, tokens: { theme: '#E93323' } }),
    );
    expect(after).toMatchObject({ tokens: { theme: '#E93323' } });
  });

  it('sends the other theme once it is activated', async () => {
    const [, festive] = await seedThemes();
    const { GET } = await import('./theme/route');

    const { after } = await provesConditional(reader(GET, '/api/v1/diy/theme'), () =>
      activateTheme(harness.ctx, { id: festive!.id }),
    );
    expect(after).toMatchObject({ id: festive!.id, name: '节日' });
  });
});

describe('GET /api/v1/diy/layouts/:type', () => {
  it('answers 304 until the operator picks another layout', async () => {
    const { GET } = await import('./layouts/[type]/route');

    const { before, after } = await provesConditional(
      reader(GET, '/api/v1/diy/layouts/category', { type: 'category' }),
      () => harness.ctx.config.set(diyConfig, { categoryLayout: 3 }),
    );
    expect(before).toEqual({ status: 1 });
    expect(after).toEqual({ status: 3 });
  });
});

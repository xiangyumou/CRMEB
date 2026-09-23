import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PRODUCT_DETAIL_DEFAULT_VALUE } from '@shop/contracts/diy/product-detail.default';
import { themes } from '@shop/db/schema/diy';
import { createTestCtx, runConcurrently, type TestCtx } from '@shop/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Ctx } from '../kernel/context';
import { type DomainError } from '../kernel/errors';
import {
  activateTheme,
  copyPage,
  createLink,
  createPage,
  deleteLink,
  deletePage,
  diyConfig,
  getHomePage,
  getLayout,
  getNavigation,
  getPage,
  getPageVersion,
  getProductDetailPage,
  getStorefrontPage,
  getUserCenterPage,
  listLinks,
  listPages,
  listThemes,
  publishPage,
  restorePageDefault,
  savePageAsDefault,
  savePageContent,
  setHomePage,
  updateLink,
  updatePage,
  updateTheme,
} from './index';

let harness: TestCtx;
let ctx: Ctx;

const FIXTURES = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'contracts',
  'src',
  'diy',
  '__fixtures__',
);

/**
 * A real production page, read exactly as it is stored. The fixture's `value`
 * is a JSON string in some rows and already-decoded JSON in others, so both are
 * handled.
 */
function pageValueOf(fileName: string): Record<string, unknown> {
  const row = JSON.parse(readFileSync(path.join(FIXTURES, fileName), 'utf8')) as {
    value: unknown;
  };
  return (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) as Record<
    string,
    unknown
  >;
}

const PROD_PAGE = pageValueOf('prod-6.json');
/** `prod-8` is the one production home page with `status = 1`; it carries a 底部导航. */
const PROD_LIVE_HOME = pageValueOf('prod-8.json');

const RETIRED = JSON.parse(
  readFileSync(path.join(FIXTURES, 'retired-components.json'), 'utf8'),
) as Record<string, unknown>;

beforeAll(async () => {
  harness = await createTestCtx();
  ctx = harness.ctx;
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
});

async function seedHome(name = '默认首页') {
  return createPage(ctx, { name, kind: 'home', title: '商城首页' });
}

describe('pages', () => {
  it('creates, lists and reads back', async () => {
    const created = await seedHome();
    expect(created.status).toBe('draft');
    expect(created.content).toEqual({});

    const list = await listPages(ctx, { page: 1, pageSize: 20 });
    expect(list.total).toBe(1);
    expect(list.items[0]?.name).toBe('默认首页');

    const detail = await getPage(ctx, { id: created.id });
    expect(detail.id).toBe(created.id);
  });

  it('renames without touching the content', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE });
    const renamed = await updatePage(ctx, { id: page.id, name: '首页 2026' });
    expect(renamed.name).toBe('首页 2026');
    expect(renamed.content).toEqual(PROD_PAGE);
  });

  it('filters by kind and keyword', async () => {
    await seedHome('首页模板');
    await createPage(ctx, { name: '活动专题', kind: 'micro' });
    expect((await listPages(ctx, { page: 1, pageSize: 20, kind: 'micro' })).total).toBe(1);
    expect((await listPages(ctx, { page: 1, pageSize: 20, keyword: '专题' })).total).toBe(1);
    expect((await listPages(ctx, { page: 1, pageSize: 20, keyword: '不存在' })).total).toBe(0);
  });
});

describe('saving content', () => {
  it('stores a production page without changing a single value', async () => {
    const page = await seedHome();
    const saved = await savePageContent(ctx, { id: page.id, content: PROD_PAGE });
    // The whole point of the domain: nothing defaulted, nothing coerced,
    // nothing dropped — including the keys no schema in this build knows.
    expect(saved.content).toEqual(PROD_PAGE);

    const reread = await getPage(ctx, { id: page.id });
    expect(reread.content).toEqual(PROD_PAGE);
    expect(Object.keys(reread.content)).toEqual(Object.keys(PROD_PAGE));
  });

  it('is the database, not this code, that reorders the keys inside a node', async () => {
    // Worth pinning, because every schema in `contracts/src/diy` is built to
    // preserve key order and it would be reasonable to assume the whole path
    // does. It does not: PostgreSQL `jsonb` stores an object as a sorted map
    // (by key length, then bytewise) and cannot represent insertion order.
    //
    // Harmless for the renderer, which addresses everything by key and sorts
    // the components by `timestamp` itself — but it does mean a dump of a
    // stored row will not diff byte for byte against what was sent. The
    // byte-exact guarantee lives at the wire, where `parseDiyPageValue` hands
    // back its input.
    const page = await seedHome();
    const node = { zzzz: 1, a: 2, name: 'titles', timestamp: 1 };
    const saved = await savePageContent(ctx, { id: page.id, content: { '1': node } });
    const stored = saved.content['1'] as Record<string, unknown>;
    expect(stored).toEqual(node);
    expect(Object.keys(stored)).toEqual(['a', 'name', 'zzzz', 'timestamp']);
  });

  it('keeps the unknown keys of the stored envelope', async () => {
    const page = await seedHome();
    await harness.db.db.execute(
      // A stored envelope can carry `version` and `orderStatus` beside `value`
      // in the same blob.
      `update diy_pages set content = '{"value":{},"version":"67bd313ce57d7","orderStatus":2}'::jsonb where id = ${Number(page.id)}`,
    );
    const saved = await savePageContent(ctx, {
      id: (await getPage(ctx, { id: page.id })).id,
      content: { '1': { name: 'titles', timestamp: 1 } },
    });
    expect(saved.content).toEqual({ '1': { name: 'titles', timestamp: 1 } });

    // A raw read gets jsonb as text (see `@shop/db`'s client), so parse it here.
    const [row] = await harness.db.db
      .execute<{ content: string }>(`select content from diy_pages where id = ${Number(page.id)}`)
      .then((r) => (r as unknown as { rows: { content: string }[] }).rows)
      .then((rows) =>
        rows.map((r) => ({ content: JSON.parse(r.content) as Record<string, unknown> })),
      );
    // `orderStatus` is not ours to touch, so it is still there. `version` is
    // ours: every content save mints a new one.
    expect(row?.content.orderStatus).toBe(2);
    expect(row?.content.version).not.toBe('67bd313ce57d7');
    expect(typeof row?.content.version).toBe('string');
  });

  it('refuses an invalid envelope and leaves the row alone', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE });
    await expect(
      savePageContent(ctx, { id: page.id, content: { '1': { name: 'titles', isHide: 'yes' } } }),
    ).rejects.toMatchObject({ code: 'DIY_CONTENT_INVALID' });

    const after = await getPage(ctx, { id: page.id });
    expect(after.content).toEqual(PROD_PAGE);
  });

  it('strips the hydrated product list down to ids', async () => {
    const page = await seedHome();
    const saved = await savePageContent(ctx, {
      id: page.id,
      content: {
        '1': {
          name: 'goodList',
          timestamp: 1,
          tabConfig: { tabVal: 1 },
          goodsList: { list: [{ id: 3, store_name: 'a' }] },
        },
      },
    });
    expect(saved.content['1']).toMatchObject({ goodsList: { ids: [3] } });
    expect(
      (saved.content['1'] as { goodsList: Record<string, unknown> }).goodsList.list,
    ).toBeUndefined();
  });

  it('refuses a version that is out of date', async () => {
    const page = await seedHome();
    const first = await savePageContent(ctx, { id: page.id, content: {}, version: page.version });
    harness.clock.advance(1000);
    await expect(
      savePageContent(ctx, { id: page.id, content: {}, version: page.version }),
    ).rejects.toMatchObject({ code: 'DIY_VERSION_CONFLICT' });
    // The version the last save handed back still works.
    await expect(
      savePageContent(ctx, { id: page.id, content: {}, version: first.version }),
    ).resolves.toBeTruthy();
  });

  it('lets exactly one of several simultaneous saves win', async () => {
    const page = await seedHome();
    const report = await runConcurrently(5, () =>
      savePageContent(ctx, { id: page.id, content: {}, version: page.version }),
    );
    // Same millisecond, same guard: the losers see the row move underneath them.
    expect(report.fulfilled).toHaveLength(1);
    expect(report.rejected).toHaveLength(4);
    for (const reason of report.rejected) {
      expect((reason as DomainError).code).toBe('DIY_VERSION_CONFLICT');
    }
  });

  it('publishes in the same round trip when asked', async () => {
    const page = await seedHome();
    const saved = await savePageContent(ctx, { id: page.id, content: {}, publish: true });
    expect(saved.status).toBe('published');
    expect(saved.publishedAt).not.toBeNull();
  });
});

describe('publish, home and copy', () => {
  it('publishes and sets the home page, unsetting the previous one', async () => {
    const first = await seedHome('首页 A');
    const second = await seedHome('首页 B');
    await setHomePage(ctx, { id: first.id });
    expect((await getPage(ctx, { id: first.id })).isHome).toBe(true);

    await setHomePage(ctx, { id: second.id });
    expect((await getPage(ctx, { id: first.id })).isHome).toBe(false);
    expect((await getPage(ctx, { id: second.id })).isHome).toBe(true);
    // Switching to a template also publishes it, in one click.
    expect((await getPage(ctx, { id: second.id })).status).toBe('published');
  });

  it('refuses to make a 微页面 the home page', async () => {
    const micro = await createPage(ctx, { name: '专题', kind: 'micro' });
    await expect(setHomePage(ctx, { id: micro.id })).rejects.toMatchObject({
      code: 'DIY_HOME_KIND_MISMATCH',
    });
  });

  it('refuses to delete the home page and allows deleting the rest', async () => {
    const home = await seedHome();
    await setHomePage(ctx, { id: home.id });
    await expect(deletePage(ctx, { id: home.id })).rejects.toMatchObject({
      code: 'DIY_PAGE_UNDELETABLE',
    });

    const other = await createPage(ctx, { name: '专题', kind: 'micro' });
    await deletePage(ctx, { id: other.id });
    await expect(getPage(ctx, { id: other.id })).rejects.toMatchObject({
      code: 'DIY_PAGE_NOT_FOUND',
    });
    expect((await listPages(ctx, { page: 1, pageSize: 20 })).total).toBe(1);
  });

  it('copies the envelope verbatim as a draft', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE, publish: true });
    await setHomePage(ctx, { id: page.id });

    const copy = await copyPage(ctx, { id: page.id });
    expect(copy.id).not.toBe(page.id);
    expect(copy.name).toBe('默认首页 副本');
    expect(copy.isHome).toBe(false);
    expect(copy.status).toBe('draft');
    expect(copy.content).toEqual(PROD_PAGE);
  });

  it('refuses to publish a page whose content does not parse', async () => {
    const page = await seedHome();
    await harness.db.db.execute(
      `update diy_pages set content = '{"value":{"1":{"name":"titles","isHide":"yes"}}}'::jsonb where id = ${Number(page.id)}`,
    );
    await expect(publishPage(ctx, { id: page.id })).rejects.toMatchObject({
      code: 'DIY_CONTENT_INVALID',
    });
  });
});

describe('factory defaults', () => {
  async function seedTheme(data: Record<string, unknown>) {
    const now = harness.clock.now();
    await harness.db.db.insert(themes).values({
      name: '默认主题',
      kind: 'custom',
      isActive: true,
      data,
      createdAt: now,
      updatedAt: now,
    });
  }

  it('restores the active theme’s factory content for the surface', async () => {
    await seedTheme({ home: { value: { '1': { name: 'titles', timestamp: 1 } } } });
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE });

    const restored = await restorePageDefault(ctx, { id: page.id });
    expect(restored.content).toEqual({ '1': { name: 'titles', timestamp: 1 } });
  });

  it('round-trips through 设为默认数据', async () => {
    await seedTheme({});
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE });
    await savePageAsDefault(ctx, { id: page.id });

    await savePageContent(ctx, { id: page.id, content: {} });
    const restored = await restorePageDefault(ctx, { id: page.id });
    expect(restored.content).toEqual(PROD_PAGE);
  });

  it('says so when there is no factory copy', async () => {
    const page = await seedHome();
    await expect(restorePageDefault(ctx, { id: page.id })).rejects.toMatchObject({
      code: 'DIY_NO_DEFAULT_CONTENT',
    });

    await seedTheme({});
    const micro = await createPage(ctx, { name: '专题', kind: 'micro' });
    await expect(restorePageDefault(ctx, { id: micro.id })).rejects.toMatchObject({
      code: 'DIY_NO_DEFAULT_CONTENT',
    });
  });
});

describe('the storefront read', () => {
  it('serves the home page with the retired components stripped', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: RETIRED, publish: true });
    await setHomePage(ctx, { id: page.id });

    const served = await getHomePage(ctx);
    expect(Object.keys(served.content)).toEqual(['1600000000000002', '1600000000000004']);
    // The row still has everything; only the read filters.
    expect(Object.keys((await getPage(ctx, { id: page.id })).content)).toHaveLength(7);
  });

  it('hides a draft from shoppers', async () => {
    const page = await createPage(ctx, { name: '专题', kind: 'micro' });
    await expect(getStorefrontPage(ctx, { id: page.id })).rejects.toMatchObject({
      code: 'DIY_PAGE_NOT_FOUND',
    });
    await savePageContent(ctx, { id: page.id, content: {}, publish: true });
    await expect(getStorefrontPage(ctx, { id: page.id })).resolves.toMatchObject({ id: page.id });
  });

  it('says so when no page has been made the home page', async () => {
    await expect(getHomePage(ctx)).rejects.toMatchObject({ code: 'DIY_HOME_PAGE_MISSING' });
    await expect(getPageVersion(ctx, {})).rejects.toMatchObject({
      code: 'DIY_HOME_PAGE_MISSING',
    });
  });

  it('moves the version on every save, so the app knows to re-fetch', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: {}, publish: true });
    await setHomePage(ctx, { id: page.id });
    const before = (await getPageVersion(ctx, {})).version;

    harness.clock.advance(5000);
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE });
    expect((await getPageVersion(ctx, {})).version).not.toBe(before);
  });

  it('sets a weak ETag when the call came through handle()', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: {}, publish: true });
    await setHomePage(ctx, { id: page.id });

    const headers: Record<string, string> = {};
    const withHeaders = Object.assign(Object.create(Object.getPrototypeOf(ctx) as object), ctx, {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    }) as Ctx & { setHeader: (name: string, value: string) => void };

    const served = await getHomePage(withHeaders);
    expect(headers.ETag).toBe(`W/"${served.version}"`);
  });

  /**
   * The home page is the first read of every launch and the largest slice of
   * database time under load. Mirrors the 个人中心 and 底部导航 cache cases
   * below.
   */
  it('caches the home page for 60 s and drops the entry the moment an operator publishes', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE, publish: true });
    await setHomePage(ctx, { id: page.id });

    const first = await getHomePage(ctx);
    expect(Object.keys(first.content).length).toBeGreaterThan(0);
    expect(await harness.redis.ttl('diy:home:v1')).toBeGreaterThan(0);
    expect(await harness.redis.ttl('diy:home:v1')).toBeLessThanOrEqual(60);

    // Write straight past the service, so only a cache hit can still answer
    // the old value — for the page and for the version poll alike.
    await harness.db.db.execute(
      sql`update diy_pages set content = '{"value":{}}'::jsonb, updated_at = now() + interval '1 hour' where id = ${Number(page.id)}`,
    );
    expect(await getHomePage(ctx)).toEqual(first);
    expect(await getPageVersion(ctx, {})).toEqual({ version: first.version });

    // A publish invalidates, and the next read is honest again.
    harness.clock.advance(1000);
    await publishPage(ctx, { id: page.id });
    expect(await harness.redis.get('diy:home:v1')).toBeNull();
    const fresh = await getHomePage(ctx);
    expect(fresh.content).toEqual({});
    expect(fresh.version).not.toBe(first.version);
    expect(await getPageVersion(ctx, {})).toEqual({ version: fresh.version });
  });

  it('drops the home entry on a save, a switch of home page and an edit alike', async () => {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: {}, publish: true });
    await setHomePage(ctx, { id: page.id });
    await getHomePage(ctx);
    expect(await harness.redis.get('diy:home:v1')).not.toBeNull();

    harness.clock.advance(1000);
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE });
    expect(await harness.redis.get('diy:home:v1')).toBeNull();

    await getHomePage(ctx);
    const other = await seedHome('活动首页');
    await savePageContent(ctx, { id: other.id, content: {}, publish: true });
    await getHomePage(ctx);
    await setHomePage(ctx, { id: other.id });
    expect(await harness.redis.get('diy:home:v1')).toBeNull();
    expect((await getHomePage(ctx)).id).toBe(other.id);

    await updatePage(ctx, { id: other.id, title: '新标题' });
    expect(await harness.redis.get('diy:home:v1')).toBeNull();
    expect((await getHomePage(ctx)).title).toBe('新标题');
  });

  it('does not cache a missing home page', async () => {
    await expect(getHomePage(ctx)).rejects.toMatchObject({ code: 'DIY_HOME_PAGE_MISSING' });
    expect(await harness.redis.get('diy:home:v1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

/**
 * Three public reads beyond the page routes: 个人中心, 底部导航 and the 版式
 * switch.
 *
 * All three are read through the production fixtures rather than hand-written
 * content, because what is being asserted is that a real decorated page
 * survives the trip. `prod-8` is the one home page with `status = 1` and it
 * carries a 底部导航; `prod-3` and `prod-4` are the two 版式 settings rows,
 * whose values are `1` and `2`.
 */
describe('个人中心 / 底部导航 / 版式', () => {
  async function seedUserCenter(content = PROD_PAGE) {
    const page = await createPage(ctx, { name: '个人中心', kind: 'user_center', title: '我的' });
    await savePageContent(ctx, { id: page.id, content, publish: true });
    return page;
  }

  async function seedLiveHome() {
    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_LIVE_HOME, publish: true });
    await setHomePage(ctx, { id: page.id });
    return page;
  }

  it('serves 个人中心 in the same envelope as any other page, content untouched', async () => {
    const page = await seedUserCenter();
    const served = await getUserCenterPage(ctx);

    expect(served.id).toBe(page.id);
    expect(served.kind).toBe('user_center');
    expect(served.title).toBe('我的');
    // The whole point: the renderer gets the same shape `pages/:id` answers.
    expect(Object.keys(served).sort()).toEqual(
      Object.keys(await getStorefrontPage(ctx, { id: page.id })).sort(),
    );
    // A real production page round-trips byte for byte, key order included.
    expect(served.content).toEqual(PROD_PAGE);
    expect(Object.keys(served.content)).toEqual(Object.keys(PROD_PAGE));
  });

  it('serves the newest published 个人中心, and ignores a draft beside it', async () => {
    const published = await seedUserCenter();
    const draft = await createPage(ctx, { name: '个人中心改版', kind: 'user_center' });
    await savePageContent(ctx, { id: draft.id, content: {} });

    expect((await getUserCenterPage(ctx)).id).toBe(published.id);

    harness.clock.advance(5000);
    await savePageContent(ctx, { id: draft.id, content: {}, publish: true });
    expect((await getUserCenterPage(ctx)).id).toBe(draft.id);
  });

  it('says nobody has published a 个人中心 rather than "模板不存在"', async () => {
    await expect(getUserCenterPage(ctx)).rejects.toMatchObject({
      code: 'DIY_USER_CENTER_PAGE_MISSING',
    });
    // A draft is not published, so it does not count.
    const draft = await createPage(ctx, { name: '个人中心', kind: 'user_center' });
    await savePageContent(ctx, { id: draft.id, content: {} });
    await expect(getUserCenterPage(ctx)).rejects.toMatchObject({
      code: 'DIY_USER_CENTER_PAGE_MISSING',
    });
  });

  it('answers 底部导航 with the fixture’s own tab bar, verbatim', async () => {
    await seedLiveHome();
    const { navigation } = await getNavigation(ctx);

    // The lookup matches `name` case-insensitively; the fixture stores the
    // component under the key `undefined`, which is exactly why the lookup is
    // by `name` and not by key.
    const expected = PROD_LIVE_HOME['undefined'] as Record<string, unknown>;
    expect(navigation).toEqual(expected);
    expect((navigation as { menuList: unknown[] }).menuList).toHaveLength(4);
    // Every field `components/pageFooter/index.vue` reads off it is present.
    for (const key of ['effectConfig', 'navStyleConfig', 'bgColor2', 'fillet', 'topConfig']) {
      expect(navigation).toHaveProperty(key);
    }
  });

  it('answers null rather than 404 when the shop uses the native tab bar', async () => {
    // No home page at all: every tabbar page mounts this component, and a shop
    // mid-setup must not have every screen erroring.
    await expect(getNavigation(ctx)).resolves.toEqual({ navigation: null, version: '0' });

    const page = await seedHome();
    await savePageContent(ctx, { id: page.id, content: PROD_PAGE, publish: true });
    await setHomePage(ctx, { id: page.id });
    // `prod-6` has a 底部导航; strip it and the answer is still not an error.
    const withoutFooter = Object.fromEntries(
      Object.entries(PROD_PAGE).filter(
        ([, value]) => (value as { name?: string }).name !== 'pageFoot',
      ),
    );
    await savePageContent(ctx, { id: page.id, content: withoutFooter });
    expect((await getNavigation(ctx)).navigation).toBeNull();
  });

  it('defaults both 版式 switches when nothing has been configured', async () => {
    expect(await getLayout(ctx, { type: 'category' })).toEqual({ status: 1 });
    expect(await getLayout(ctx, { type: 'user' })).toEqual({ status: 1 });
  });

  it('serves the values the production settings rows carry', async () => {
    // `prod-3` (template_name 'category') holds 1, `prod-4` ('member') holds 2.
    await ctx.config.set(diyConfig, { categoryLayout: 1, userCenterLayout: 2 });
    expect(await getLayout(ctx, { type: 'category' })).toEqual({ status: 1 });
    expect(await getLayout(ctx, { type: 'user' })).toEqual({ status: 2 });
  });

  /**
   * The cache is the reason these three exist as their own service, so it is
   * worth a test that actually proves both halves: that a second read does not
   * touch the database, and that a publish drops the entry.
   */
  it('caches for 60 s and drops the entry the moment an operator publishes', async () => {
    const page = await seedLiveHome();
    const first = await getNavigation(ctx);
    expect(first.navigation).not.toBeNull();

    // Write straight past the service, so only a cache hit can still answer
    // the old value.
    await harness.db.db.execute(
      sql`update diy_pages set content = '{"value":{}}'::jsonb where id = ${Number(page.id)}`,
    );
    expect((await getNavigation(ctx)).navigation).toEqual(first.navigation);
    expect(await harness.redis.get('diy:navigation:v1')).not.toBeNull();

    // A publish invalidates, and the next read is honest again.
    await publishPage(ctx, { id: page.id });
    expect(await harness.redis.get('diy:navigation:v1')).toBeNull();
    expect((await getNavigation(ctx)).navigation).toBeNull();
  });

  it('drops the 个人中心 entry on a save, a publish and a delete alike', async () => {
    const page = await seedUserCenter();
    await getUserCenterPage(ctx);
    expect(await harness.redis.get('diy:user-center:v1')).not.toBeNull();

    harness.clock.advance(1000);
    await savePageContent(ctx, { id: page.id, content: {} });
    expect(await harness.redis.get('diy:user-center:v1')).toBeNull();

    await getUserCenterPage(ctx);
    await deletePage(ctx, { id: page.id });
    expect(await harness.redis.get('diy:user-center:v1')).toBeNull();
    await expect(getUserCenterPage(ctx)).rejects.toMatchObject({
      code: 'DIY_USER_CENTER_PAGE_MISSING',
    });
  });
});

describe('商品详情', () => {
  async function seedProductDetail(content: Record<string, unknown> = PROD_PAGE) {
    const page = await createPage(ctx, { name: '商品详情', kind: 'product_detail', title: '详情' });
    await savePageContent(ctx, { id: page.id, content, publish: true });
    return page;
  }

  it('answers the built-in default when nothing is published, not a 404', async () => {
    const served = await getProductDetailPage(ctx);

    expect(served.id).toBeNull();
    expect(served.kind).toBe('product_detail');
    expect(served.version).toBe('builtin-product-detail-1');
    // The constant verbatim: `cleanDiyData` has nothing to strip from it.
    expect(served.content).toEqual(PRODUCT_DETAIL_DEFAULT_VALUE);
    expect(Object.keys(served.content)).toEqual(Object.keys(PRODUCT_DETAIL_DEFAULT_VALUE));
    // The same keys as any other storefront page, so the renderer needs nothing new.
    expect(Object.keys(served).sort()).toEqual(
      ['background', 'content', 'id', 'kind', 'name', 'schemaVersion', 'title', 'version'].sort(),
    );
  });

  it('holds the default to the same validation a saved page gets', async () => {
    // Saving it through the editor's own path is the strictest check there is.
    const page = await createPage(ctx, { name: '商品详情', kind: 'product_detail' });
    await expect(
      savePageContent(ctx, { id: page.id, content: PRODUCT_DETAIL_DEFAULT_VALUE }),
    ).resolves.toMatchObject({ id: page.id });
  });

  it('ignores a draft, and a published page wins over the default', async () => {
    const draft = await createPage(ctx, { name: '商品详情草稿', kind: 'product_detail' });
    await savePageContent(ctx, { id: draft.id, content: PROD_PAGE });
    expect((await getProductDetailPage(ctx)).id).toBeNull();

    const published = await seedProductDetail();
    const served = await getProductDetailPage(ctx);
    expect(served.id).toBe(published.id);
    expect(served.title).toBe('详情');
    expect(served.content).toEqual(PROD_PAGE);
  });

  it('serves the newest published page, and never another kind', async () => {
    // A published 个人中心 is not a product page.
    const other = await createPage(ctx, { name: '个人中心', kind: 'user_center' });
    await savePageContent(ctx, { id: other.id, content: PROD_PAGE, publish: true });
    expect((await getProductDetailPage(ctx)).id).toBeNull();

    const first = await seedProductDetail();
    harness.clock.advance(5000);
    const second = await seedProductDetail({});
    expect((await getProductDetailPage(ctx)).id).toBe(second.id);

    await deletePage(ctx, { id: second.id });
    expect((await getProductDetailPage(ctx)).id).toBe(first.id);
  });

  it('strips retired components from a published page, like every storefront read', async () => {
    await seedProductDetail(RETIRED);
    const { content } = await getProductDetailPage(ctx);
    // The same two survivors the home-page read keeps from this fixture.
    expect(Object.keys(content)).toEqual(['1600000000000002', '1600000000000004']);
  });

  it('caches, and a publish drops the entry so the default gives way at once', async () => {
    await getProductDetailPage(ctx);
    expect(await harness.redis.get('diy:product-detail:v1')).not.toBeNull();

    const page = await createPage(ctx, { name: '商品详情', kind: 'product_detail' });
    await savePageContent(ctx, { id: page.id, content: {} });
    // A draft save also invalidates, harmlessly; the default is re-served.
    expect((await getProductDetailPage(ctx)).id).toBeNull();

    await publishPage(ctx, { id: page.id });
    expect(await harness.redis.get('diy:product-detail:v1')).toBeNull();
    expect((await getProductDetailPage(ctx)).id).toBe(page.id);
  });
});

describe('themes', () => {
  async function seedThemes() {
    const now = harness.clock.now();
    await harness.db.db.insert(themes).values([
      { name: '内置', kind: 'built_in', isActive: true, data: {}, createdAt: now, updatedAt: now },
      { name: '自定义', kind: 'custom', isActive: false, data: {}, createdAt: now, updatedAt: now },
    ]);
    return (await listThemes(ctx)).items;
  }

  it('edits the tokens of a custom theme and refuses a built-in one', async () => {
    const [builtIn, custom] = await seedThemes();
    await expect(
      updateTheme(ctx, { id: builtIn!.id, tokens: { theme: '#000000' } }),
    ).rejects.toMatchObject({ code: 'DIY_THEME_BUILT_IN_READONLY' });

    const updated = await updateTheme(ctx, { id: custom!.id, tokens: { theme: '#00AA00' } });
    expect(updated.tokens).toEqual({ theme: '#00AA00' });
  });

  it('activates exactly one theme at a time', async () => {
    const [builtIn, custom] = await seedThemes();
    await activateTheme(ctx, { id: custom!.id });
    const items = (await listThemes(ctx)).items;
    expect(items.filter((t) => t.isActive).map((t) => t.id)).toEqual([custom!.id]);
    expect(items.find((t) => t.id === builtIn!.id)?.isActive).toBe(false);
  });
});

describe('the link registry', () => {
  it('creates, renames and deletes a link', async () => {
    const link = await createLink(ctx, { name: '商品详情', url: '/pages/goods_details/index' });
    expect((await listLinks(ctx, {})).items).toHaveLength(1);

    const renamed = await updateLink(ctx, { id: link.id, name: '商品详情页' });
    expect(renamed.name).toBe('商品详情页');

    await deleteLink(ctx, { id: link.id });
    expect((await listLinks(ctx, {})).items).toHaveLength(0);
  });

  it('refuses a duplicate url with a message instead of a 500', async () => {
    await createLink(ctx, { name: 'A', url: '/pages/index/index' });
    await expect(createLink(ctx, { name: 'B', url: '/pages/index/index' })).rejects.toMatchObject({
      code: 'DIY_LINK_URL_EXISTS',
    });
  });

  it('never offers a link to a page the storefront no longer ships', async () => {
    await createLink(ctx, { name: '积分商城', url: '/pages/points_mall/index' });
    await createLink(ctx, { name: '首页', url: '/pages/index/index' });
    expect((await listLinks(ctx, {})).items.map((l) => l.url)).toEqual(['/pages/index/index']);
  });

  it('hides disabled links from the picker but not from the admin list', async () => {
    const link = await createLink(ctx, { name: '首页', url: '/pages/index/index' });
    await updateLink(ctx, { id: link.id, isEnabled: false });
    expect((await listLinks(ctx, {})).items).toHaveLength(0);
    expect((await listLinks(ctx, { includeDisabled: true })).items).toHaveLength(1);
  });
});

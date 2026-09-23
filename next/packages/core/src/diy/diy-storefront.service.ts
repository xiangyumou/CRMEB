import {
  PRODUCT_DETAIL_DEFAULT_VALUE,
  PRODUCT_DETAIL_DEFAULT_VERSION,
} from '@shop/contracts/diy/product-detail.default';
import type {
  DiyLayout,
  DiyLayoutType,
  DiyNavigation,
  DiyProductDetailPage,
  DiyStorefrontPage,
} from '@shop/contracts/diy/schemas';

import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { cleanDiyData } from './compatibility';
import { versionOf } from './content';
import { DIY_CACHE } from './diy.cache';
import { diyConfig } from './diy.config';
import { toStorefront, type ReadCtx } from './diy-page.service';
import * as repo from './diy.repo';

/**
 * The public 装修 reads the app makes that G1's four routes did not answer:
 * 个人中心, 底部导航 and the 版式 switch (CR-3-h2), and 商品详情 (CR-2-h3).
 *
 * ## Why these are cached and `pages/home` is not
 *
 * The home page already has a cheap poll of its own — `GET /api/v1/diy/version`
 * plus the `ETag`, which the app checks on resume and which lets a 200 KB page
 * body be skipped entirely. These three do not: 底部导航 is mounted on *every*
 * tabbar page and refetched on each `onShow`, and 版式 is two integers behind a
 * round trip. Sixty seconds in Redis turns that traffic into one database read
 * a minute per surface, and every mutation that could change them drops the
 * keys, so an operator who publishes still sees the change at once.
 *
 * A cache that is merely unwell is never fatal: a Redis error is logged at
 * `warn` and the value is rebuilt from the database, the same discipline as
 * `system/site.service.ts`.
 */

const {
  seconds: CACHE_SECONDS,
  userCenter: USER_CENTER_KEY,
  navigation: NAVIGATION_KEY,
  productDetail: PRODUCT_DETAIL_KEY,
} = DIY_CACHE;

/**
 * Legacy `getNavigation` matched `strtolower($item['name']) === 'pagefoot'`.
 * The component's declared name is `pageFoot`, and a page decorated by an older
 * editor may carry either casing, so the comparison stays case-insensitive.
 */
const NAVIGATION_COMPONENT = 'pagefoot';

// ---------------------------------------------------------------------------
// 个人中心
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/diy/pages/user-center`.
 *
 * The same envelope `pages/:id` answers, so `pages/user/index.vue` renders it
 * with the renderer it already has. The page is found by `kind`, because 个人
 * 中心 has no id the app could know: the legacy data addressed it by
 * `template_name = 'member'`, and the new schema says the same thing with an
 * enum column.
 */
export async function getUserCenterPage(ctx: ReadCtx): Promise<DiyStorefrontPage> {
  const cached = await readCache<DiyStorefrontPage>(ctx, USER_CENTER_KEY);
  if (cached !== null) return tagged(ctx, cached);

  const row = await repo.findLatestPublishedOfKind(ctx.db, 'user_center');
  if (!row) throw new DomainError('DIY_USER_CENTER_PAGE_MISSING');

  const payload = toStorefront(row);
  await writeCache(ctx, USER_CENTER_KEY, payload);
  return tagged(ctx, payload);
}

// ---------------------------------------------------------------------------
// 商品详情
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/diy/pages/product-detail` (CR-2-h3).
 *
 * The newest published `product_detail` page, found by `kind` exactly as 个人
 * 中心 is. When there is none — every shop until an operator decorates one —
 * the built-in default instead of a 404: `pages/goods_details/index.vue` has no
 * body except this page, and a shop that never touched 装修 still sells.
 *
 * The default is the legacy install's own default detail page
 * (`PRODUCT_DETAIL_DEFAULT_VALUE`); it goes through `cleanDiyData` like any
 * saved page would (a no-op on it, which the tests pin), so a component retired
 * later is stripped from it without anyone remembering to edit the constant.
 *
 * Cached like 个人中心: this is read on every product page view, far more often
 * than any other 装修 surface, and every 装修 write drops the key.
 */
export async function getProductDetailPage(ctx: ReadCtx): Promise<DiyProductDetailPage> {
  const cached = await readCache<DiyProductDetailPage>(ctx, PRODUCT_DETAIL_KEY);
  if (cached !== null) return tagged(ctx, cached);

  const row = await repo.findLatestPublishedOfKind(ctx.db, 'product_detail');
  const payload: DiyProductDetailPage = row ? toStorefront(row) : builtInProductDetailPage();

  await writeCache(ctx, PRODUCT_DETAIL_KEY, payload);
  return tagged(ctx, payload);
}

function builtInProductDetailPage(): DiyProductDetailPage {
  return {
    id: null,
    name: '商品详情',
    kind: 'product_detail',
    title: '商品详情',
    content: cleanDiyData(PRODUCT_DETAIL_DEFAULT_VALUE),
    schemaVersion: 1,
    background: null,
    version: PRODUCT_DETAIL_DEFAULT_VERSION,
  };
}

// ---------------------------------------------------------------------------
// 底部导航
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/diy/navigation` — legacy `getNavigation`.
 *
 * Read off the live home page, exactly where the legacy reader took it from.
 * The component is returned verbatim (after the retired-component filter every
 * storefront read applies), because `components/pageFooter/index.vue` reads two
 * dozen fields straight off it.
 *
 * A shop with no home page answers `{ navigation: null }` rather than the
 * home page's 404: the tab bar is mounted on every page, and a shop mid-setup
 * should not have every screen erroring because nobody has published a home
 * page yet.
 */
export async function getNavigation(ctx: ReadCtx): Promise<DiyNavigation> {
  const cached = await readCache<DiyNavigation>(ctx, NAVIGATION_KEY);
  if (cached !== null) return tagged(ctx, cached);

  const row = await repo.findHomePage(ctx.db);
  const payload: DiyNavigation = row
    ? { navigation: navigationOf(toStorefront(row).content), version: versionOf(row) }
    : { navigation: null, version: '0' };

  await writeCache(ctx, NAVIGATION_KEY, payload);
  return tagged(ctx, payload);
}

function navigationOf(content: Record<string, unknown>): Record<string, unknown> | null {
  for (const value of Object.values(content)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string' && name.toLowerCase() === NAVIGATION_COMPONENT) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 版式
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/diy/layouts/:type`.
 *
 * No cache of its own: `ctx.config.get` is already a Redis read with its own
 * invalidation on save, so a second layer would only add a second way to go
 * stale.
 */
export async function getLayout(ctx: Ctx, input: { type: DiyLayoutType }): Promise<DiyLayout> {
  const config = await ctx.config.get(diyConfig);
  return { status: input.type === 'category' ? config.categoryLayout : config.userCenterLayout };
}

// ---------------------------------------------------------------------------
// cache plumbing
// ---------------------------------------------------------------------------

async function readCache<T>(ctx: Ctx, key: string): Promise<T | null> {
  try {
    const raw = await ctx.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (error) {
    ctx.logger.warn({ err: error, key }, 'diy: storefront cache read failed');
    return null;
  }
}

async function writeCache(ctx: Ctx, key: string, payload: unknown): Promise<void> {
  try {
    await ctx.redis.set(key, JSON.stringify(payload), 'EX', CACHE_SECONDS);
  } catch (error) {
    ctx.logger.warn({ err: error, key }, 'diy: storefront cache write failed');
  }
}

/** The same weak validator the other storefront reads set. */
function tagged<T extends { version: string }>(ctx: ReadCtx, payload: T): T {
  ctx.setHeader?.('ETag', `W/"${payload.version}"`);
  ctx.setHeader?.('Cache-Control', 'no-cache');
  return payload;
}

import { wechatMiniCodes } from '@shop/db/schema/wechat';
import { createTestCtx, flushTestRedis, type TestCtx } from '@shop/testing';
import { startFakeOaServer, type FakeOaServer } from '@shop/testing/wechat';
import { decodeScene } from '@shop/contracts/system/storefront-routes';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../kernel/context';
import { wechatMiniConfig } from '../system';
import { resetWechatTokenFlight } from './wechat.client';
import { wechatConfig } from './wechat.config';
import { miniCodeUrl, shareMiniCodeUrl } from './wechat.mini-code.service';

/**
 * 小程序码 against a fake `api.weixin.qq.com`.
 *
 * The property worth a test: **the second caller does not reach WeChat**.
 * `wxa/getwxacodeunlimit` is quota'd per day and the answer for a
 * `(page, scene)` pair never changes, so a shop whose poster page asks on every
 * render burns the quota and then serves broken images to everyone. The fake
 * counts calls, so "hit once, then never again" is an assertion rather than a
 * hope.
 *
 * The other two are the failure shapes: a refusal must not be stored as a
 * picture, and a scene WeChat would reject must be refused before it costs a
 * call.
 */

let harness: TestCtx;
let oa: FakeOaServer;

const NOW = '2026-06-01T00:00:00.000Z';
const PAGE = 'pages/goods_details/index';
const SCENE = 'id=1024';

function ctx(): Ctx {
  return harness.as({ kind: 'user', id: 1, permissions: [], isSuper: false });
}

function codeCalls(): number {
  return oa.callsTo('/wxa/getwxacodeunlimit').length;
}

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
  oa = await startFakeOaServer();
}, 180_000);

afterAll(async () => {
  await oa?.close();
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await flushTestRedis(harness.redis);
  harness.clock.set(NOW);
  oa.reset();
  resetWechatTokenFlight();

  await harness.ctx.config.set(wechatConfig, {
    miniAppId: oa.miniAppId,
    miniAppSecret: oa.miniAppSecret,
    apiBaseUrl: oa.url,
  });
  await harness.ctx.config.set(wechatMiniConfig, { enabled: true });
});

describe('miniCodeUrl', () => {
  it('asks WeChat once for a pair and serves every later caller from the cache', async () => {
    const first = await miniCodeUrl(ctx(), { page: PAGE, scene: SCENE });
    expect(first.url).toMatch(/\.png$/);
    expect(codeCalls()).toBe(1);
    expect(oa.miniCodes).toEqual([{ page: PAGE, scene: SCENE }]);

    const second = await miniCodeUrl(ctx(), { page: PAGE, scene: SCENE });
    expect(second.url).toBe(first.url);
    expect(codeCalls()).toBe(1);

    // One row, and the bytes really are in storage under the key it names.
    const rows = await harness.ctx.db.select().from(wechatMiniCodes);
    expect(rows).toHaveLength(1);
    expect(await harness.ctx.storage.exists(rows[0]!.storageKey)).toBe(true);
    expect(rows[0]!.url).toBe(first.url);
  });

  it('keys the cache on the pair, not on the page alone', async () => {
    // Two products share a page path and differ only in the scene, which is the
    // common case: a cache keyed on `page` would hand every product the first
    // product's poster.
    const one = await miniCodeUrl(ctx(), { page: PAGE, scene: 'id=1' });
    const two = await miniCodeUrl(ctx(), { page: PAGE, scene: 'id=2' });
    expect(two.url).not.toBe(one.url);
    expect(codeCalls()).toBe(2);
  });

  it('turns a WeChat refusal into WECHAT_MINI_CODE_FAILED and caches nothing', async () => {
    // WeChat answers 200 with a JSON body on failure — an unpublished mini
    // program is `41030`. Storing that as a PNG would serve a broken image for
    // ever, and it is exactly what a client that trusted the status line does.
    oa.behaviour.failWxaCode = { errcode: 41030, errmsg: 'invalid page' };

    await expect(miniCodeUrl(ctx(), { page: PAGE, scene: SCENE })).rejects.toMatchObject({
      code: 'WECHAT_MINI_CODE_FAILED',
      details: { errcode: 41030 },
    });
    expect(await harness.ctx.db.select().from(wechatMiniCodes)).toHaveLength(0);

    // And the shop recovers by itself once the mini program is published: the
    // failure left nothing behind to invalidate.
    oa.behaviour.failWxaCode = null;
    await expect(miniCodeUrl(ctx(), { page: PAGE, scene: SCENE })).resolves.toMatchObject({
      url: expect.stringMatching(/\.png$/),
    });
  });

  it('refuses a scene over WeChat’s 32 bytes before spending a call', async () => {
    // Bytes, not characters: eleven Chinese characters are 33 bytes and would
    // come back as `40097 invalid args`, a number nobody can act on.
    await expect(miniCodeUrl(ctx(), { page: PAGE, scene: '促'.repeat(11) })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(miniCodeUrl(ctx(), { page: PAGE, scene: '' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(codeCalls()).toBe(0);
  });

  it('refuses while the mini program is not configured, without calling WeChat', async () => {
    await harness.ctx.config.set(wechatMiniConfig, { enabled: false });
    await expect(miniCodeUrl(ctx(), { page: PAGE, scene: SCENE })).rejects.toMatchObject({
      code: 'AUTH_WECHAT_NOT_CONFIGURED',
    });
    expect(codeCalls()).toBe(0);
  });
});

describe('shareMiniCodeUrl', () => {
  it('takes the page from the catalogue and the scene from encodeScene — SHARE-001', async () => {
    const product = await shareMiniCodeUrl(ctx(), { route: 'product', id: '1024' });
    const team = await shareMiniCodeUrl(ctx(), { route: 'groupbuyTeam', id: '501' });
    const home = await shareMiniCodeUrl(ctx(), { route: 'home' });

    expect(oa.miniCodes).toEqual([
      { page: 'pages/product/index', scene: 'id=1024' },
      { page: 'packages/promo/groupbuy-team/index', scene: 'id=501' },
      { page: 'pages/index/index', scene: '_' },
    ]);
    // The page reads its params back from the scene it is opened with.
    expect(decodeScene('groupbuyTeam', oa.miniCodes[1]!.scene)).toEqual({ id: '501' });
    expect(new Set([product.url, team.url, home.url]).size).toBe(3);
  });

  it('shares the (page, scene) cache with the legacy endpoint — SHARE-001', async () => {
    const legacy = await miniCodeUrl(ctx(), { page: 'pages/index/index', scene: '_' });
    const shared = await shareMiniCodeUrl(ctx(), { route: 'home' });
    expect(shared.url).toBe(legacy.url);
    expect(codeCalls()).toBe(1);
  });

  it('refuses params that do not fit the key, without calling WeChat — SHARE-001', async () => {
    await expect(shareMiniCodeUrl(ctx(), { route: 'home', id: '1' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(shareMiniCodeUrl(ctx(), { route: 'product' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(codeCalls()).toBe(0);
    expect(await harness.ctx.db.select().from(wechatMiniCodes)).toHaveLength(0);
  });

  it('refuses a key the catalogue does not mark miniCode — SHARE-001', async () => {
    await expect(
      shareMiniCodeUrl(ctx(), { route: 'order' as never, id: '1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(codeCalls()).toBe(0);
  });
});

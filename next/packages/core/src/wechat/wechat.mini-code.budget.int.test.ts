import { wechatMiniCodes } from '@shop/db/schema/wechat';
import { createTestCtx, flushTestRedis, type TestCtx } from '@shop/testing';
import { startFakeOaServer, type FakeOaServer } from '@shop/testing/wechat';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../kernel/context';
import { wechatMiniConfig } from '../system';
import { resetWechatTokenFlight } from './wechat.client';
import { wechatConfig } from './wechat.config';
import { miniCodeUrl } from './wechat.mini-code.service';

/**
 * `GET /api/v1/wechat/mini-qrcodes`, read as a signed-in shopper with a loop
 * (K2, AUDIT.md K-SEC-M1).
 *
 * The `(page, scene)` cache makes the *same* pair free after the first call.
 * A *new* pair always costs a `wxa/getwxacodeunlimit` call, a PNG in the
 * storage root and a `wechat_mini_codes` row, and the scene is any string of
 * up to 32 bytes the caller likes. Nothing counts how many new pairs one
 * account asks for, so one free account can grow the uploads volume and the
 * table without bound and spend the mini program's API rate on it.
 *
 * The `it.fails` is CR-11-k2 and flips when a per-user budget on *uncached*
 * pairs lands.
 */

let harness: TestCtx;
let oa: FakeOaServer;

const NOW = '2026-06-01T00:00:00.000Z';
const PAGE = 'pages/goods_details/index';

function shopper(): Ctx {
  return harness.as({ kind: 'user', id: 1, permissions: [], isSuper: false });
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

describe('K-SEC-M1 — how many new codes one shopper can mint', () => {
  it.fails('stops minting new codes for one account well before a hundred in an hour', async () => {
    for (let i = 0; i < 100; i += 1) {
      await miniCodeUrl(shopper(), { page: PAGE, scene: `junk=${i}` }).catch(() => undefined);
    }
    expect(oa.callsTo('/wxa/getwxacodeunlimit').length).toBeLessThanOrEqual(30);
    expect((await harness.ctx.db.select().from(wechatMiniCodes)).length).toBeLessThanOrEqual(30);
  });
});

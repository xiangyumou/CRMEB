import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { startFakeOaServer, type FakeOaServer } from '@shop/testing/wechat';
import type { Actor, Ctx } from '../kernel/context';
import { paymentConfig } from '../payment';
import { refundConfig } from '../refund';
import { getWechatClient, resetWechatTokenFlight, wechatConfig } from '../wechat';
import { configGet, configSave } from './config.service';
import { wechatOaConfig } from './wechat-oa.config';
import './index';
import '../domains.gen';

/**
 * The settings screens, read as an attacker holding a *narrow* console role
 * (K2, AUDIT.md K-SEC-C1 and K-SEC-C2; K-SEC-R9 pinned for CR-10-k).
 *
 * The contract the config routes promise is: a credential is write-only (the
 * form gets an "is set" boolean), and the form writes the fields it shows.
 * Both `it.fails` below are a way round that contract, and each flips to a
 * failure when its CR lands — the signal to make it a plain `it`.
 */

let harness: TestCtx;
let oa: FakeOaServer;

const NOW = '2026-09-22T08:00:00.000Z';

function as(permissions: string[]): Ctx {
  const actor: Actor = { kind: 'admin', id: 7, permissions, isSuper: false };
  return harness.ctx.as(actor);
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
  await harness.redis.flushdb();
  harness.clock.set(NOW);
  oa.reset();
  resetWechatTokenFlight();
});

describe('K-SEC-C1 — the OA callback token on the settings screen', () => {
  // `wechat-oa.token` is the whole of the 明文-mode webhook's authentication
  // (`sha1(sort(token, timestamp, nonce))`), yet the field is `type: 'text'`,
  // so `configGet` hands it to anyone holding `system:config:read` — the
  // lowest settings atom there is. With it, every OA callback body can be
  // forged (CR-7-k2). The sibling `wechat.oaToken` *is* secret; the registry
  // heuristic in system.test.ts misses this one because it does not match
  // `token`. CR-8-k2.
  it.fails('never returns the webhook token to a read-only settings role', async () => {
    await harness.ctx.config.set(wechatOaConfig, { token: 'the-callback-token' });

    const read = await configGet(as(['system:config:read']), { group: 'wechat-oa' });

    expect(JSON.stringify(read)).not.toContain('the-callback-token');
  });
});

describe('K-SEC-C2 — a schema key the form never shows', () => {
  // `configSave` accepts every key of the zod schema, not only the ones with a
  // `ui` entry. `wechat.apiBaseUrl` has none — it exists so the tests can point
  // the client at a fake — but a holder of `payment:config:write` can post it.
  // `refresh()` then sends `appid` and the stored **AppSecret** on the query
  // string of `GET {apiBaseUrl}/cgi-bin/token`: a write-only credential read
  // back by pointing the server at a host the attacker controls, and an SSRF
  // from the app container while it lasts. The fake OA server stands in for
  // the attacker's host. CR-9-k2 (same for `payment.apiBaseUrl`).
  it.fails('refuses to repoint the WeChat client from the settings form', async () => {
    // The shop is configured the ordinary way, with the real WeChat host.
    await harness.ctx.config.set(wechatConfig, {
      oaAppId: oa.appId,
      oaAppSecret: oa.appSecret,
    });

    const attacker = as(['payment:config:write']);
    await configSave(attacker, { group: 'wechat' }, { values: { apiBaseUrl: oa.url } }).catch(
      () => undefined,
    );
    // Show the secret is not readable through the front door…
    expect(JSON.stringify(await configGet(attacker, { group: 'wechat' }))).not.toContain(
      oa.appSecret,
    );
    // …then take it through the back one: any token refresh will do.
    await getWechatClient(harness.ctx)
      .accessToken('oa')
      .catch(() => undefined);

    const leaked = oa.callsTo('/cgi-bin/token').map((call) => call.query['secret']);
    expect(leaked).not.toContain(oa.appSecret);
  });

  it.fails('refuses to repoint the WeChat Pay client from the settings form', async () => {
    await configSave(
      as(['payment:config:write']),
      { group: 'payment' },
      { values: { apiBaseUrl: 'http://169.254.169.254' } },
    ).catch(() => undefined);

    const stored = await harness.ctx.config.get(paymentConfig);
    expect(stored.apiBaseUrl).toBe('https://api.mch.weixin.qq.com');
  });
});

describe('K-SEC-R9 — the 售后设置 group and the 备注 atom', () => {
  // `refundConfig.permission` is `refund:request:write`, which the refund
  // domain declares as 备注售后单. `writePermissionFor` derives a write atom
  // only from a `:read` one, so the remark permission is also the permission to
  // rewrite the address buyers post their returns to. CR-10-k.
  it.fails('does not let the remark permission rewrite the return address', async () => {
    await configSave(
      as(['refund:request:write']),
      { group: 'refund' },
      { values: { returnAddress: '别处 1 号' } },
    ).catch(() => undefined);

    const stored = await harness.ctx.config.get(refundConfig);
    expect(stored.returnAddress).toBe('');
  });
});

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { fixedClock } from '../kernel/clock';
import type { ConfigGroupDef } from '../kernel/config-registry';
import { getConfigTest } from '../kernel/config-test';
import type { Ctx } from '../kernel/context';
import { wechatConfig } from './wechat.config';
import { registerWechatConfigTest } from './wechat.config-test';

const clock = fixedClock('2026-09-24T10:00:00Z');
const logger = { warn: () => undefined, error: () => undefined } as unknown as Ctx['logger'];

/** A ctx whose saved settings are `saved`, keyed by group. */
function ctxWith(saved: Record<string, Record<string, unknown>> = {}): Ctx {
  return {
    clock,
    logger,
    config: {
      get: async (def: ConfigGroupDef) => def.schema.parse(saved[def.group] ?? {}),
    },
  } as unknown as Ctx;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeAll(() => registerWechatConfigTest());
afterEach(() => vi.unstubAllGlobals());

describe('wechat 「测试 AppSecret」', () => {
  it('asks for a stable token for each app filled in, and explains the whitelist refusal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: 'x', expires_in: 7200 }))
      .mockResolvedValueOnce(json({ errcode: 40164, errmsg: 'invalid ip 1.2.3.4' }));
    vi.stubGlobal('fetch', fetch);

    const result = await getConfigTest('wechat')!.run(
      ctxWith(),
      wechatConfig.schema.parse({
        oaAppId: 'wxoa',
        oaAppSecret: 's1',
        miniAppId: 'wxmini',
        miniAppSecret: 's2',
      }),
      {},
    );

    expect(String(fetch.mock.calls[0]![0])).toBe('https://api.weixin.qq.com/cgi-bin/stable_token');
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).toMatchObject({
      appid: 'wxoa',
      force_refresh: false,
    });
    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => [step.name, step.ok])).toEqual([
      ['公众号：获取 access_token', true],
      ['小程序：获取 access_token', false],
    ]);
    expect(result.steps[1]!.detail).toContain('IP 白名单');
    expect(result.steps[1]!.detail).toContain('40164');
  });

  it('refuses with no AppID at all', async () => {
    const result = await getConfigTest('wechat')!.run(ctxWith(), wechatConfig.schema.parse({}), {});
    expect(result.steps).toEqual([
      { name: '检查配置', ok: false, detail: '公众号和小程序的 AppID 都没有填写' },
    ]);
  });
});

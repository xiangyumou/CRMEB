import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { fixedClock } from '../kernel/clock';
import type { ConfigGroupDef } from '../kernel/config-registry';
import { getConfigTest } from '../kernel/config-test';
import type { Ctx } from '../kernel/context';
import { paymentConfig } from './payment.config';
import { registerPaymentConfigTest } from './payment.config-test';

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

beforeAll(() => registerPaymentConfigTest());
afterEach(() => vi.unstubAllGlobals());

describe('payment 「测试签名」', () => {
  const filled = {
    mchId: '1900000001',
    apiV3Key: 'a'.repeat(32),
    certSerial: 'SERIAL',
    merchantPrivateKey: 'not a pem',
    platformPublicKeyId: 'PUB_KEY_ID_1',
    platformPublicKey: 'not a pem',
    notifyBaseUrl: 'https://shop.example.com',
  };

  it('names every missing field', async () => {
    const result = await getConfigTest('payment')!.run(
      ctxWith(),
      paymentConfig.schema.parse({ mchId: '1900000001' }),
      {},
    );
    expect(result.steps[0]!.detail).toBe(
      '没有填写：APIv3 密钥、API 证书序列号、商户 API 私钥、微信支付公钥 ID、微信支付公钥、回调域名',
    );
  });

  it('refuses an APIv3 key of the wrong length before any request', async () => {
    const result = await getConfigTest('payment')!.run(
      ctxWith(),
      paymentConfig.schema.parse({ ...filled, apiV3Key: 'short' }),
      {},
    );
    expect(result.steps[0]!.detail).toBe('APIv3 密钥应为 32 位，现在是 5 位');
  });

  it('refuses a private key that is not PEM', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await getConfigTest('payment')!.run(
      ctxWith(),
      paymentConfig.schema.parse(filled),
      {},
    );
    expect(result.steps.at(-1)).toMatchObject({ name: '读取密钥', ok: false });
    expect(result.steps.at(-1)!.detail).toContain('商户 API 私钥');
    expect(fetch).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { registerSmsConfigTest } from '../sms/sms.config-test';
import { fakeSmsSender } from '../sms/sms.fake';
import { registerSmsSender, resetSmsSender } from '../sms/sms.port';
import { registerStorageConfigTest } from '../storage/storage.config-test';
import { storageConfig } from '../storage/storage.config';
import { smsConfig } from '../system';
import { fixedClock } from './clock';
import type { Ctx } from './context';
import { getConfigTest, testSteps } from './config-test';
import { memoryStorage, type Storage } from './storage';

const clock = fixedClock('2026-09-24T10:00:00Z');
const logger = { warn: () => undefined } as unknown as Ctx['logger'];

function ctxWith(storage: Storage): Ctx {
  return { clock, storage, logger } as unknown as Ctx;
}

const smsValues = (patch: Record<string, unknown> = {}) =>
  smsConfig.schema.parse({
    provider: 'tencent',
    tencentAppId: '1400000000',
    tencentSecretId: 'id',
    tencentSecretKey: 'key',
    tencentSignName: '某某商城',
    templateVerifyCode: '2433',
    ...patch,
  });

beforeAll(() => {
  registerSmsConfigTest();
  registerStorageConfigTest();
});

describe('testSteps', () => {
  it('stops at the first failure and reports the thrown message', async () => {
    const t = testSteps({ clock });
    await t.step('一', async () => '好');
    await t.step('二', async () => {
      throw new Error('坏了');
    });
    const ran = await t.step('三', async () => '不该跑');
    expect(ran).toBe(false);
    expect(t.result()).toEqual({
      ok: false,
      steps: [
        { name: '一', ok: true, detail: '好', ms: 0 },
        { name: '二', ok: false, detail: '坏了', ms: 0 },
      ],
    });
  });

  it('is not ok with no steps at all', () => {
    expect(testSteps({ clock }).result().ok).toBe(false);
  });
});

describe('sms 「发送测试短信」', () => {
  afterEach(() => resetSmsSender());

  it('sends the verification template to the phone typed', async () => {
    const fake = fakeSmsSender();
    registerSmsSender(fake);
    const hook = getConfigTest('sms')!;

    const result = await hook.run(ctxWith(memoryStorage()), smsValues(), { phone: '13800138000' });

    expect(result.ok).toBe(true);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]).toMatchObject({ phone: '13800138000', templateId: '2433' });
    expect(result.steps.at(-1)?.detail).toBe('已受理，消息 ID fake-1');
  });

  it("shows the provider's refusal as a failed step", async () => {
    const fake = fakeSmsSender();
    fake.failNext(1, { providerCode: 'FailedOperation.SignatureIncorrect', error: '签名不正确' });
    registerSmsSender(fake);

    const result = await getConfigTest('sms')!.run(ctxWith(memoryStorage()), smsValues(), {
      phone: '13800138000',
    });

    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({
      name: '发送验证码短信',
      ok: false,
      detail: 'FailedOperation.SignatureIncorrect · 签名不正确',
    });
  });

  it('refuses before sending when no provider is chosen', async () => {
    const result = await getConfigTest('sms')!.run(
      ctxWith(memoryStorage()),
      smsValues({ provider: 'none' }),
      { phone: '13800138000' },
    );
    expect(result).toEqual({
      ok: false,
      steps: [{ name: '检查配置', ok: false, detail: '未选择短信服务商' }],
    });
  });

  it('refuses before sending without a verification template', async () => {
    registerSmsSender(fakeSmsSender());
    const result = await getConfigTest('sms')!.run(
      ctxWith(memoryStorage()),
      smsValues({ templateVerifyCode: '' }),
      { phone: '13800138000' },
    );
    expect(result.steps).toEqual([
      { name: '检查配置', ok: false, detail: '没有填写「验证码模板 ID」' },
    ]);
  });
});

describe('storage 「测试读写」', () => {
  it('writes, reads back and deletes a probe on the local driver', async () => {
    const storage = memoryStorage();
    const result = await getConfigTest('storage')!.run(
      ctxWith(storage),
      storageConfig.schema.parse({ driver: 'local' }),
      {},
    );

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual([
      '写入探针文件',
      '读回并比对',
      '删除探针文件',
    ]);
    const key = result.steps[0]!.detail!;
    expect(key).toMatch(/^probe\//);
    expect(await storage.exists(key)).toBe(false);
  });

  it('refuses an S3 driver with no credentials before touching the network', async () => {
    const result = await getConfigTest('storage')!.run(
      ctxWith(memoryStorage()),
      storageConfig.schema.parse({ driver: 's3', s3Bucket: 'shop' }),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.name).toBe('检查配置');
  });

  it('cleans up the probe when reading it back fails', async () => {
    const storage = memoryStorage();
    const broken: Storage = { ...storage, get: () => Promise.reject(new Error('读不到')) };
    const result = await getConfigTest('storage')!.run(
      ctxWith(broken),
      storageConfig.schema.parse({ driver: 'local' }),
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ name: '读回并比对', ok: false, detail: '读不到' });
    expect(await storage.exists(result.steps[0]!.detail!)).toBe(false);
  });
});

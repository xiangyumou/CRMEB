import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configValues } from '@shop/db/schema/system';
import { createTestCtx, type TestCtx } from '@shop/testing';
import {
  createConfigService,
  defineConfigGroup,
  getConfigGroup,
  pruneUnknownKeys,
  resetConfigRegistry,
  type ConfigService,
} from './config-registry';
import { type DomainError } from './errors';

let harness: TestCtx;
let config: ConfigService;

const paymentConfig = defineConfigGroup({
  group: 'payment',
  title: '支付设置',
  schema: z.object({
    wechatEnabled: z.boolean().default(false),
    wechatMchId: z.string().default(''),
    autoCancelMinutes: z.number().int().min(1).max(1440).default(30),
    notifyUrls: z.array(z.string()).default([]),
  }),
  ui: {
    wechatEnabled: { label: '启用微信支付', type: 'switch' },
    wechatMchId: { label: '商户号', type: 'text' },
    autoCancelMinutes: { label: '未支付自动取消（分钟）', type: 'number' },
    notifyUrls: { label: '回调地址', type: 'json' },
  },
  legacyKeys: { wechatMchId: ['pay_weixin_mchid'], autoCancelMinutes: 'order_cancel_time' },
  permission: 'system:config:update',
});

beforeAll(async () => {
  harness = await createTestCtx();
  config = harness.ctx.config;
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
});

describe('defineConfigGroup', () => {
  it('registers the group so the generic admin screen can find it', () => {
    expect(getConfigGroup('payment')).toBe(paymentConfig);
  });

  it('refuses a group whose fields are not all defaulted', () => {
    // A fresh install has no rows; a field without a default makes the shop
    // unreadable before anybody has saved anything.
    expect(() =>
      defineConfigGroup({
        group: 'broken',
        title: 'x',
        schema: z.object({ required: z.string() }),
        ui: {},
      }),
    ).toThrow('必须有 .default()');
  });

  it('refuses a badly named group and a duplicate registration', () => {
    expect(() =>
      defineConfigGroup({ group: 'Payment', title: 'x', schema: z.object({}), ui: {} }),
    ).toThrow('小写短横线');
    expect(() =>
      defineConfigGroup({ group: 'payment', title: 'x', schema: z.object({}), ui: {} }),
    ).toThrow('重复定义');
  });

  it('keeps the legacy key map the ETL needs', () => {
    expect(paymentConfig.legacyKeys?.wechatMchId).toEqual(['pay_weixin_mchid']);
  });
});

describe('config.get', () => {
  it('returns schema defaults when nothing has ever been saved', async () => {
    expect(await config.get(paymentConfig)).toEqual({
      wechatEnabled: false,
      wechatMchId: '',
      autoCancelMinutes: 30,
      notifyUrls: [],
    });
  });

  it('is typed: values come back as the types the schema declares', async () => {
    await config.set(paymentConfig, { wechatEnabled: true, autoCancelMinutes: 15 });
    const values = await config.get(paymentConfig);
    expect(values.wechatEnabled).toBe(true);
    expect(values.autoCancelMinutes).toBe(15);
    // jsonb keeps a boolean a boolean — the old sys_config stored "1".
    const rows = await harness.ctx.db.select().from(configValues);
    expect(rows.find((r) => r.key === 'wechatEnabled')?.value).toBe(true);
  });

  it('falls back to the default for a stored value the schema no longer accepts', async () => {
    await harness.ctx.db.insert(configValues).values({
      group: 'payment',
      key: 'autoCancelMinutes',
      value: 'thirty' as never,
    });
    const values = await config.get(paymentConfig);
    expect(values.autoCancelMinutes).toBe(30);
  });
});

describe('config.set', () => {
  it('writes only the keys that actually changed', async () => {
    await config.set(paymentConfig, { wechatEnabled: true });
    expect(await harness.ctx.db.select().from(configValues)).toHaveLength(1);

    await config.set(paymentConfig, { wechatEnabled: true, wechatMchId: '1900000001' });
    const rows = await harness.ctx.db.select().from(configValues);
    expect(rows.map((r) => r.key).sort()).toEqual(['wechatEnabled', 'wechatMchId']);
  });

  it('records who changed it', async () => {
    await config.set(paymentConfig, { wechatMchId: '1900000001' }, { updatedBy: 42 });
    const [row] = await harness.ctx.db.select().from(configValues);
    expect(row?.updatedBy).toBe(42);
    expect(row?.updatedAt.getTime()).toBe(harness.clock.nowMs());
  });

  it('validates the whole group and refuses a bad value with field details', async () => {
    const error = await config
      .set(paymentConfig, { autoCancelMinutes: 99_999 })
      .catch((e: DomainError) => e);
    expect((error as DomainError).code).toBe('VALIDATION_FAILED');
    expect((error as DomainError).details).toEqual([
      { field: 'autoCancelMinutes', message: expect.any(String) },
    ]);
    // Nothing was written.
    expect(await harness.ctx.db.select().from(configValues)).toHaveLength(0);
  });

  it('updates an existing key rather than inserting a duplicate', async () => {
    await config.set(paymentConfig, { wechatMchId: 'a' });
    await config.set(paymentConfig, { wechatMchId: 'b' });
    const rows = await harness.ctx.db.select().from(configValues);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('b');
  });
});

describe('the Redis cache', () => {
  it('serves the second read from Redis', async () => {
    await config.set(paymentConfig, { wechatMchId: '1900000001' });
    await config.get(paymentConfig);
    expect(await harness.redis.get('config:payment')).toContain('1900000001');
  });

  it('is invalidated on write, so a later read sees the new value', async () => {
    await config.get(paymentConfig);
    expect(await harness.redis.get('config:payment')).toBe('{}');

    await config.set(paymentConfig, { autoCancelMinutes: 5 });
    expect(await harness.redis.get('config:payment')).toBeNull();
    expect((await config.get(paymentConfig)).autoCancelMinutes).toBe(5);
  });

  it('a second process sees the write, because the cache key is shared', async () => {
    const other = createConfigService({
      db: harness.ctx.db,
      cache: {
        get: (key) => harness.redis.get(key),
        set: (key, value, _mode, ttl) => harness.redis.set(key, value, 'PX', ttl),
        del: (...keys) => harness.redis.del(...keys),
      },
      clock: harness.clock,
    });

    await other.get(paymentConfig); // warms the shared cache
    await config.set(paymentConfig, { wechatMchId: 'from-process-one' });
    expect((await other.get(paymentConfig)).wechatMchId).toBe('from-process-one');
  });

  it('survives a corrupt cache entry instead of failing every request', async () => {
    await harness.redis.set('config:payment', 'not json');
    expect(await config.get(paymentConfig)).toMatchObject({ autoCancelMinutes: 30 });
  });

  it('invalidate() drops the entry by hand', async () => {
    await config.get(paymentConfig);
    await config.invalidate('payment');
    expect(await harness.redis.get('config:payment')).toBeNull();
  });

  it('getRaw returns what is stored, for the generic admin form', async () => {
    await config.set(paymentConfig, { wechatMchId: 'x' });
    expect(await config.getRaw('payment')).toEqual({ wechatMchId: 'x' });
    expect(await config.getRaw('nothing-here')).toEqual({});
  });
});

describe('pruneUnknownKeys', () => {
  it('removes keys the schema no longer declares and reports them', async () => {
    await harness.ctx.db.insert(configValues).values([
      { group: 'payment', key: 'wechatMchId', value: 'keep' as never },
      { group: 'payment', key: 'alipayAppId', value: 'drop' as never },
    ]);
    expect(await pruneUnknownKeys(harness.ctx.db, paymentConfig)).toEqual(['alipayAppId']);
    const rows = await harness.ctx.db.select().from(configValues);
    expect(rows.map((r) => r.key)).toEqual(['wechatMchId']);
  });
});

describe('registry hygiene', () => {
  it('resetConfigRegistry is available to tests that need a clean slate', () => {
    resetConfigRegistry();
    expect(getConfigGroup('payment')).toBeUndefined();
    // Put it back for any test that runs after this one in the same file.
    defineConfigGroup(paymentConfig);
    expect(getConfigGroup('payment')).toBeDefined();
  });
});

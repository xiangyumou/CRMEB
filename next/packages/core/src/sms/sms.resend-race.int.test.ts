import { createTestCtx, forkTestCtx, runConcurrently, type TestCtx } from '@shop/testing';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../kernel/context';
import type { DomainError } from '../kernel/errors';
import { smsConfig } from '../system';
import { fakeSmsSender, registerSmsSender, resetSmsSender, type FakeSmsSender } from './index';
import { sendVerificationCode } from './sms.service';
import { resendKey } from './verification-code';

/**
 * CR-50-k2. STAB-001 found this: `user.concurrency.int.test.ts > SMS codes >
 * lets one of six sends through the resend guard` failed once in ten shuffled
 * rounds, with five of the six sends delivered.
 *
 * The test's comment says "`SET NX` decides". The code does not use `SET NX`.
 * `sendVerificationCode` checks the resend key with `PTTL` (`resendWaitMs`),
 * then checks the budgets and reads the config, and only then writes the key
 * with a plain `SET … PX` inside `issueCode`'s `MULTI`. That is a check followed
 * by a separate write, so every caller that reads `PTTL` before the first
 * `SET` lands gets through and costs one SMS, up to the per-phone hourly
 * budget (five by default). Whether the original test passes depends on how
 * the six callers interleave on the shared connection.
 *
 * This file makes the interleaving deterministic. Each caller's `PTTL` on the
 * resend key waits until all six have read it, which is the schedule a loaded
 * machine produces by chance. The test is pinned as `it.fails` until the check
 * and the write are one atomic step (`SET NX PX` first, and roll back on a
 * budget refusal or a provider refusal). It flips to `it` then.
 */

let harness: TestCtx;
let sms: FakeSmsSender;

const NOW = '2026-06-01T00:00:00.000Z';
const PHONE = '13800138000';
const SCENE = 'login';
const WORKERS = 6;

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);
  sms = fakeSmsSender();
  registerSmsSender(sms);
  await harness.ctx.config.set(smsConfig, { templateVerifyCode: 'SMS_1' });
});

afterEach(() => {
  resetSmsSender();
});

/**
 * The harness's Redis, except that `PTTL` on the resend key holds every caller
 * until `parties` of them have read it.
 */
function redisWithResendBarrier(redis: Redis, parties: number): Redis {
  const key = resendKey(SCENE, PHONE);
  let arrived = 0;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return new Proxy(redis, {
    get(target, prop) {
      if (prop === 'pttl') {
        return async (name: string) => {
          const ttl = await target.pttl(name);
          if (name === key) {
            arrived += 1;
            if (arrived === parties) open();
            await gate;
          }
          return ttl;
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

function send(ctx: Ctx) {
  return sendVerificationCode(ctx, {
    scene: SCENE,
    phone: PHONE,
    ttlMs: 300_000,
    resendMs: 60_000,
    perIpPerDay: 100,
  });
}

describe('CR-50-k2 — the resend guard is a check, then a separate write', () => {
  it('passes the guard once, sequentially', async () => {
    // The control: without the interleaving, the guard works.
    await send(forkTestCtx(harness));
    await expect(send(forkTestCtx(harness))).rejects.toMatchObject({
      code: 'AUTH_SMS_TOO_FREQUENT',
    });
    expect(sms.sent).toHaveLength(1);
  });

  it.fails('costs one SMS when six taps all read the resend key before any writes it', async () => {
    const redis = redisWithResendBarrier(harness.redis, WORKERS);
    const base = { ...harness, redis } as TestCtx;

    const report = await runConcurrently(WORKERS, (index) =>
      send(forkTestCtx(base, { requestId: `tap-${index}` })),
    );

    expect(sms.sent).toHaveLength(1);
    expect(report.fulfilled).toHaveLength(1);
    for (const failure of report.rejected) {
      expect((failure as DomainError).code).toBe('AUTH_SMS_TOO_FREQUENT');
    }
  });
});

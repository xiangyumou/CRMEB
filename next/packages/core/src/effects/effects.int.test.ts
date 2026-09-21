import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { effects as effectsTable } from '@shop/db/schema/system';
import { createTestCtx, runConcurrently, type TestCtx } from '@shop/testing';
import { withTx } from '../kernel/tx';
import type { EffectInput, EffectKey } from './index';
import {
  dispatchEffectsOnce,
  drainEffects,
  findEffect,
  listEffectsByStatus,
  recordEffect,
  registerEffectHandler,
  registeredEffectTypes,
  resetEffectHandlers,
} from './index';

let harness: TestCtx;

beforeAll(async () => {
  harness = await createTestCtx();
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  resetEffectHandlers();
});

afterEach(() => {
  resetEffectHandlers();
});

const key: EffectKey = { scope: 'order', scopeId: '1', eventType: 'order.paid' };

async function record(overrides: Partial<EffectInput> = {}) {
  return withTx(harness.ctx.db, (tx) =>
    recordEffect(tx, harness.ctx, { ...key, payload: { hello: 'world' }, ...overrides }),
  );
}

describe('recordEffect', () => {
  it('writes one row inside the caller transaction', async () => {
    expect(await record()).toBe(true);
    const row = await findEffect(harness.ctx.db, key);
    expect(row).toMatchObject({ scope: 'order', eventType: 'order.paid', status: 'pending' });
    expect(row?.payload).toEqual({ hello: 'world' });
  });

  it('is a no-op the second time — UNIQUE(scope, scope_id, event_type)', async () => {
    expect(await record()).toBe(true);
    expect(await record({ payload: { different: true } })).toBe(false);
    expect(await listEffectsByStatus(harness.ctx.db, 'pending')).toHaveLength(1);
  });

  it('is rolled back with the state change it belongs to', async () => {
    await expect(
      withTx(harness.ctx.db, async (tx) => {
        await recordEffect(tx, harness.ctx, { ...key, payload: {} });
        throw new Error('the state change failed');
      }),
    ).rejects.toThrow();
    expect(await findEffect(harness.ctx.db, key)).toBeNull();
  });

  it('records the same event for different aggregates independently', async () => {
    await record({ scopeId: '1' });
    await record({ scopeId: '2' });
    expect(await listEffectsByStatus(harness.ctx.db, 'pending')).toHaveLength(2);
  });

  it('honours a delay', async () => {
    await record({ delayMs: 60_000 });
    const report = await dispatchEffectsOnce(harness.ctx);
    expect(report.claimed).toBe(0);

    harness.clock.advance(61_000);
    registerEffectHandler('order', 'order.paid', async () => {});
    expect((await dispatchEffectsOnce(harness.ctx)).done).toBe(1);
  });
});

describe('the dispatcher', () => {
  it('runs the registered handler and marks the row done', async () => {
    const seen: unknown[] = [];
    registerEffectHandler('order', 'order.paid', async (_ctx, effect) => {
      seen.push(effect);
    });
    await record();

    const report = await dispatchEffectsOnce(harness.ctx);
    expect(report).toEqual({ claimed: 1, done: 1, retried: 0, parked: 0 });
    expect(seen[0]).toMatchObject({ scope: 'order', scopeId: '1', attempts: 1 });
    expect((await findEffect(harness.ctx.db, key))?.status).toBe('done');
  });

  it('does not pick a done row up again', async () => {
    registerEffectHandler('order', 'order.paid', async () => {});
    await record();
    await dispatchEffectsOnce(harness.ctx);
    expect((await dispatchEffectsOnce(harness.ctx)).claimed).toBe(0);
  });

  it('runs the handler EXACTLY ONCE under two concurrent dispatchers', async () => {
    // FOR UPDATE SKIP LOCKED plus the lease is the whole guarantee. If either
    // is wrong, a "notify WeChat" handler fires twice.
    let runs = 0;
    registerEffectHandler('order', 'order.paid', async () => {
      runs += 1;
      // Long enough that the second dispatcher is definitely inside its claim.
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    for (let i = 1; i <= 8; i += 1) await record({ scopeId: String(i) });

    const report = await runConcurrently(2, () =>
      dispatchEffectsOnce(harness.ctx, { batchSize: 8 }),
    );
    expect(report.rejected).toEqual([]);

    expect(runs).toBe(8);
    const claimed = report.fulfilled.reduce((sum, r) => sum + r.claimed, 0);
    expect(claimed).toBe(8);
    expect(await listEffectsByStatus(harness.ctx.db, 'done')).toHaveLength(8);
  });

  it('never claims a row another dispatcher is still holding', async () => {
    registerEffectHandler('order', 'order.paid', async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    await record();

    const slow = dispatchEffectsOnce(harness.ctx, { leaseMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const overlapping = await dispatchEffectsOnce(harness.ctx, { leaseMs: 60_000 });
    expect(overlapping.claimed).toBe(0);
    await slow;
  });

  it('retries with exponential backoff when a handler throws', async () => {
    let attempts = 0;
    registerEffectHandler('order', 'order.paid', async () => {
      attempts += 1;
      throw new Error('the gateway said no');
    });
    await record();

    const first = await dispatchEffectsOnce(harness.ctx, { baseBackoffMs: 1000 });
    expect(first).toMatchObject({ claimed: 1, done: 0, retried: 1, parked: 0 });

    const row = await findEffect(harness.ctx.db, key);
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain('the gateway said no');
    // First retry is one base delay out.
    expect(row!.nextRunAt.getTime()).toBe(harness.clock.nowMs() + 1000);

    // Not due yet.
    expect((await dispatchEffectsOnce(harness.ctx, { baseBackoffMs: 1000 })).claimed).toBe(0);

    harness.clock.advance(1000);
    await dispatchEffectsOnce(harness.ctx, { baseBackoffMs: 1000 });
    const second = await findEffect(harness.ctx.db, key);
    expect(second?.attempts).toBe(2);
    // Second retry is twice as far out.
    expect(second!.nextRunAt.getTime()).toBe(harness.clock.nowMs() + 2000);
    expect(attempts).toBe(2);
  });

  it('succeeds on a later attempt and stops retrying', async () => {
    let attempts = 0;
    registerEffectHandler('order', 'order.paid', async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('not yet');
    });
    await record();

    const report = await drainEffects(harness.ctx, { baseBackoffMs: 0, maxBackoffMs: 0 });
    expect(report.done).toBe(1);
    expect(attempts).toBe(3);
    expect((await findEffect(harness.ctx.db, key))?.status).toBe('done');
  });

  it('parks a row as unknown after max attempts, for a human to look at', async () => {
    registerEffectHandler('order', 'order.paid', async () => {
      throw new Error('permanently broken');
    });
    await record();

    const report = await drainEffects(harness.ctx, {
      maxAttempts: 3,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
    });
    expect(report.parked).toBe(1);

    const row = await findEffect(harness.ctx.db, key);
    expect(row?.status).toBe('unknown');
    expect(row?.attempts).toBe(3);
    expect(row?.lastError).toContain('permanently broken');
    expect(await listEffectsByStatus(harness.ctx.db, 'unknown')).toHaveLength(1);

    // A parked row is never picked up again.
    expect((await dispatchEffectsOnce(harness.ctx)).claimed).toBe(0);
  });

  it('retries, then parks, an event whose handler was never deployed', async () => {
    await record();
    const report = await drainEffects(harness.ctx, {
      maxAttempts: 2,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
    });
    expect(report.parked).toBe(1);
    expect((await findEffect(harness.ctx.db, key))?.lastError).toContain('no handler');
  });

  it('truncates a giant error message rather than storing a novel', async () => {
    registerEffectHandler('order', 'order.paid', async () => {
      throw new Error('x'.repeat(5000));
    });
    await record();
    await dispatchEffectsOnce(harness.ctx);
    expect((await findEffect(harness.ctx.db, key))?.lastError?.length).toBe(500);
  });

  it('one failing handler does not stop the rest of the batch', async () => {
    registerEffectHandler('order', 'order.paid', async (_ctx, effect) => {
      if (effect.scopeId === '2') throw new Error('just this one');
    });
    for (let i = 1; i <= 4; i += 1) await record({ scopeId: String(i) });

    const report = await dispatchEffectsOnce(harness.ctx);
    expect(report).toMatchObject({ claimed: 4, done: 3, retried: 1 });
  });

  it('respects the batch size', async () => {
    registerEffectHandler('order', 'order.paid', async () => {});
    for (let i = 1; i <= 10; i += 1) await record({ scopeId: String(i) });
    expect((await dispatchEffectsOnce(harness.ctx, { batchSize: 3 })).claimed).toBe(3);
  });
});

describe('the handler registry', () => {
  it('is keyed by scope and event type', () => {
    registerEffectHandler('order', 'order.paid', async () => {});
    registerEffectHandler('refund', 'refund.approved', async () => {});
    expect(registeredEffectTypes()).toEqual(['order/order.paid', 'refund/refund.approved']);
  });
});

describe('claim ordering', () => {
  it('takes the oldest due rows first', async () => {
    const handled: string[] = [];
    registerEffectHandler('order', 'order.paid', async (_ctx, effect) => {
      handled.push(effect.scopeId);
    });
    await record({ scopeId: 'late', delayMs: 1000 });
    await record({ scopeId: 'early' });
    harness.clock.advance(2000);

    await dispatchEffectsOnce(harness.ctx, { batchSize: 1 });
    expect(handled).toEqual(['early']);

    // Sanity: the row really is the one we think it is.
    const early = await harness.ctx.db
      .select()
      .from(effectsTable)
      .where(eq(effectsTable.scopeId, 'early'));
    expect(early[0]?.status).toBe('done');
  });
});

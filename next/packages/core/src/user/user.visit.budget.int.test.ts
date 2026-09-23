import { userVisits } from '@shop/db/schema/stats';
import { createTestCtx, flushTestRedis, type TestCtx } from '@shop/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anonymousActor } from '../kernel/context';
import { recordVisit } from './user.visit.service';

/**
 * `POST /api/v1/visits`, read as somebody with a loop (K2, AUDIT.md K-SEC-V1).
 *
 * The beacon is public and its throttle is keyed on `visit:<subject>:<path>`:
 * one row per visitor **per path** per minute. The path is the caller's to
 * choose (any `/…` up to 255 characters), so a caller who varies it is never
 * throttled at all — every request is one `user_visits` insert, and 浏览量 on
 * the dashboard is whatever the caller wants it to be. The per-path window is
 * right for what it was built for (collapsing `onShow` re-fires); what is
 * missing is a ceiling per subject across paths.
 *
 * The `it.fails` is CR-11-k2 and flips when a per-subject ceiling lands.
 */

let harness: TestCtx;

const NOW = '2026-06-15T04:00:00.000Z';
const ADDRESS = '198.51.100.23';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await flushTestRedis(harness.redis);
  harness.clock.set(NOW);
});

describe('K-SEC-V1 — what one anonymous address can write', () => {
  it('writes one row per path per minute, as designed', async () => {
    const anonymous = harness.as(anonymousActor);
    for (let i = 0; i < 5; i += 1) {
      await recordVisit(anonymous, { path: '/pages/index/index' }, { ip: ADDRESS });
    }
    expect(await harness.ctx.db.select().from(userVisits)).toHaveLength(1);
  });

  it.fails('cannot write more than a browsing session’s worth of rows in a minute', async () => {
    const anonymous = harness.as(anonymousActor);
    // Nobody browses 200 distinct pages in one minute; a script does.
    for (let i = 0; i < 200; i += 1) {
      await recordVisit(anonymous, { path: `/pages/goods_details/index/${i}` }, { ip: ADDRESS });
    }
    const rows = await harness.ctx.db.select().from(userVisits);
    expect(rows.length).toBeLessThanOrEqual(60);
  });
});

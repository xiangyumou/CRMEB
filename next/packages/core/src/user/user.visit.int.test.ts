import { userVisits } from '@shop/db/schema/stats';
import { createTestCtx, flushTestRedis, type TestCtx } from '@shop/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anonymousActor, type Ctx } from '../kernel/context';
import { clearStatsCache, userStats } from '../stats';
import * as repo from './user.repo';
import { recordVisit } from './user.visit.service';

/**
 * The page-view beacon, and the figure it exists to feed (CR-1-f3 §1).
 *
 * The assertion that matters is not "a row was inserted" — it is that 访客数
 * moves. `user_visits` has had a schema, an aggregate and a passing test since
 * F3 and has never contained a row, so the thing to prove is that the beacon
 * and the aggregate agree about what a visitor *is*: a signed-in user id, or
 * failing that an address. A recorder that wrote a row the aggregate did not
 * count would leave the figure at 0 with a full table, which is worse than the
 * empty table it replaces.
 */

let harness: TestCtx;

/** Inside the default 30-day window `userStats` resolves with no `from`/`to`. */
const NOW = '2026-06-15T04:00:00.000Z';

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

function asVisitor(userId: number | null): Ctx {
  return harness.as(
    userId === null
      ? anonymousActor
      : { kind: 'user', id: userId, permissions: [], isSuper: false },
  );
}

function asAdmin(): Ctx {
  return harness.as({ kind: 'admin', id: 1, permissions: [], isSuper: true });
}

let sequence = 0;

async function makeUser(): Promise<number> {
  sequence += 1;
  const phone = `1380014${String(1000 + sequence).padStart(4, '0')}`;
  const row = await harness.ctx.withTx((tx) =>
    repo.insertUser(tx, {
      account: phone,
      phone,
      passwordHash: null,
      passwordAlgo: null,
      nickname: `访客${sequence}`,
      avatarUrl: null,
      registerSource: 'h5',
      registerIp: null,
      now: harness.clock.now(),
    }),
  );
  if (!row) throw new Error('fixture: insertUser refused');
  return row.id;
}

/** The two figures the beacon feeds, read the way the admin screen reads them. */
async function figures(): Promise<{ visitors: number; pageViews: number }> {
  // The page is cached per window in Redis; a test that did not clear it would
  // be asserting against the answer the previous test warmed.
  await clearStatsCache(asAdmin());
  const page = await userStats(asAdmin(), {});
  const of = (key: string): number =>
    page.metrics.find((metric) => metric.key === key)?.value ?? -1;
  return { visitors: of('visitors'), pageViews: of('pageViews') };
}

describe('the visits beacon', () => {
  it('makes 访客数 count 1', async () => {
    expect(await figures()).toEqual({ visitors: 0, pageViews: 0 });

    const userId = await makeUser();
    await recordVisit(
      asVisitor(userId),
      { path: '/pages/goods_details/index' },
      { ip: '203.0.113.7' },
    );

    expect(await figures()).toEqual({ visitors: 1, pageViews: 1 });
  });

  it('counts a visitor who has not signed in, by address', async () => {
    // Most storefront traffic is anonymous, which is why the route is
    // `user-optional`; `stats` already defines a visitor as
    // `coalesce(user_id, 'ip:' || ip)` and the beacon has to write rows that
    // definition can see.
    await recordVisit(asVisitor(null), { path: '/pages/index/index' }, { ip: '198.51.100.4' });
    await recordVisit(asVisitor(null), { path: '/pages/index/index' }, { ip: '198.51.100.9' });

    expect(await figures()).toEqual({ visitors: 2, pageViews: 2 });

    const rows = await harness.ctx.db.select().from(userVisits);
    expect(rows.map((row) => row.userId)).toEqual([null, null]);
  });

  it('drops a repeat of the same page within the minute, and keeps the next one', async () => {
    const userId = await makeUser();
    const beacon = (path: string): Promise<void> =>
      recordVisit(asVisitor(userId), { path }, { ip: '203.0.113.7' });

    // A mini program's `onShow` fires every time the visitor comes back from a
    // sub-page: tapping four products out of a category would record five
    // views of the category page inside a minute.
    await beacon('/pages/index/index');
    await beacon('/pages/index/index');
    await beacon('/pages/index/index');
    // A different page in the same minute is a different view, not a repeat.
    await beacon('/pages/goods_details/index');

    expect(await figures()).toEqual({ visitors: 1, pageViews: 2 });

    // And the throttle is a window, not a ban: the same page a minute later is
    // a visitor who really did come back. The window lives in Redis with a
    // real TTL, so expiring the key is how a minute passes here — the fake
    // clock moves the rows' timestamps, not `PEXPIRE`.
    await harness.redis.del(`visit:u:${userId}:/pages/index/index`);
    await beacon('/pages/index/index');
    expect(await figures()).toEqual({ visitors: 1, pageViews: 3 });
  });

  it('throttles each visitor separately', async () => {
    // One key per visitor: a busy shop would otherwise drop everybody's second
    // view of the home page.
    await recordVisit(asVisitor(null), { path: '/pages/index/index' }, { ip: '198.51.100.4' });
    await recordVisit(asVisitor(null), { path: '/pages/index/index' }, { ip: '198.51.100.9' });
    await recordVisit(asVisitor(null), { path: '/pages/index/index' }, { ip: '198.51.100.4' });

    expect(await figures()).toEqual({ visitors: 2, pageViews: 2 });
  });

  it('records the platform the beacon named, and the header otherwise', async () => {
    const userId = await makeUser();
    await recordVisit(
      asVisitor(userId),
      { path: '/pages/index/index', platform: 'wechat-mini' },
      { ip: '203.0.113.7' },
    );
    await recordVisit(asVisitor(userId), { path: '/pages/cart/index' }, { ip: '203.0.113.7' });

    const rows = await harness.ctx.db.select().from(userVisits);
    const byPath = new Map(rows.map((row) => [row.path, row]));
    // `wechat-mini` on the wire is `wechat_mini` in the enum.
    expect(byPath.get('/pages/index/index')?.platform).toBe('wechat_mini');
    // Nothing set `X-Client-Platform` in this harness, so the column is null
    // rather than a guessed `h5` — an unknown platform must not inflate the
    // breakdown's largest bar.
    expect(byPath.get('/pages/cart/index')?.platform).toBeNull();
    // Province stays null until a geo source exists; `stats` buckets that as
    // 未知 rather than dropping the visitor.
    expect(rows.every((row) => row.province === null)).toBe(true);
  });
});

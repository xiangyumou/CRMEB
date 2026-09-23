import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { couponTemplates, userCoupons } from '@shop/db/schema/coupon';
import { users } from '@shop/db/schema/user';
import { createTestCtx, type TestCtx } from '@shop/testing';
import type { Actor, Ctx } from '../kernel/context';
import * as service from './coupon.service';

/**
 * `POST /api/v1/staff/coupon-grants`, read as a 店员 who wants the coupons for
 * themselves (K2, AUDIT.md K-SEC-B3).
 *
 * `staffGrant` is `adminGrant` with one user id: the per-user limit and the
 * supply hold, and the route's roster check (403 for a non-staff shopper) is
 * covered in `apps/web/app/api/v1/coupons.staff.int.test.ts`. What it does not
 * carry over is the judgement a console role implies. A 店员 is a storefront
 * account with a roster row; the staff coupon list offers only `active`
 * templates, but the grant takes any template id — a `draft` the marketing
 * team has not released, or one they `disabled` — and any user id, the 店员's
 * own included. The route's `ctx.audit(...)` is a no-op on the staff surface
 * (CR-13-k2), so none of it leaves a row.
 *
 * Both `it.fails` are CR-10-k2.
 */

let harness: TestCtx;

const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  harness.clock.set(NOW);
});

let sequence = 0;

async function makeUser(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(users)
    .values({ account: `u-${sequence}`, nickname: `顾客${sequence}` })
    .returning({ id: users.id });
  return row!.id;
}

async function makeTemplate(status: 'draft' | 'active' | 'disabled'): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(couponTemplates)
    .values({
      name: `券${sequence}`,
      status,
      claimMode: 'manual',
      discountAmount: '50.00',
      minSpend: '0.00',
      validityMode: 'days_after_claim',
      validDays: 30,
      isUnlimitedSupply: false,
      totalCount: 5,
      remainingCount: 5,
      perUserLimit: 1,
    })
    .returning({ id: couponTemplates.id });
  return row!.id;
}

/** Service-level: the roster check is the route's, and is tested there. */
function asStaff(userId: number): Ctx {
  const actor: Actor = { kind: 'staff', id: userId, permissions: [], isSuper: false };
  return harness.as(actor);
}

describe('K-SEC-B3 — what a 店员 can grant', () => {
  it('grants an active template to a customer, once', async () => {
    const clerk = await makeUser();
    const customer = await makeUser();
    const id = await makeTemplate('active');

    const result = await service.staffGrant(asStaff(clerk), {
      couponId: String(id),
      userId: String(customer),
    });

    expect(result).toEqual({ granted: 1, skippedUserIds: [] });
  });

  it.fails('refuses a template marketing has not released, or has withdrawn', async () => {
    const clerk = await makeUser();
    const customer = await makeUser();
    for (const status of ['draft', 'disabled'] as const) {
      const id = await makeTemplate(status);
      await service
        .staffGrant(asStaff(clerk), { couponId: String(id), userId: String(customer) })
        .catch(() => undefined);
    }
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(0);
  });

  it.fails('refuses to grant to the 店员’s own account', async () => {
    const clerk = await makeUser();
    const id = await makeTemplate('active');

    await service
      .staffGrant(asStaff(clerk), { couponId: String(id), userId: String(clerk) })
      .catch(() => undefined);

    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(0);
  });
});

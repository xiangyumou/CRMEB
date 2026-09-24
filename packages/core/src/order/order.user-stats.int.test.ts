import { orders } from '@shop/db/schema/order';
import { users } from '@shop/db/schema/user';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getUserOrderStatsPort } from '../user';
import { registerOrderDomain } from './index';
import * as repo from './order.repo';

/**
 * 累计订单 / 累计消费 — the order domain's implementation of the user domain's
 * `UserOrderStatsPort`.
 *
 * The shape (one batched call per page, an absent id meaning zero, `null`
 * while nobody has registered the port) was pinned by the staff 用户 screen's
 * tests, deleted with it at the cutover. What only a real
 * PostgreSQL can settle is the thing the port exists for — **which orders
 * count** — so every case here is one row of the population rule on
 * `statsForUsers`:
 *
 * | Order                | 累计订单 | 累计消费                          |
 * | -------------------- | -------- | --------------------------------- |
 * | 待付款               | no       | no — nothing was taken            |
 * | 已取消               | no       | no                                |
 * | paid / shipped / …   | yes      | `paid_amount`                     |
 * | 全额退款             | no       | no — not a returning customer     |
 * | 部分退款             | yes      | `paid_amount`, *not* net of it    |
 * | 后台删除的订单       | no       | no — out of every figure          |
 *
 * The 部分退款 row is the one worth arguing about, so it is asserted rather
 * than described: the console's 营业额 sums `orders.paid_amount` and reports
 * refunds as their own figure (`stats/DEFINITIONS.md` §3), and netting the
 * refund off here would give the 店员 a third definition of 消费总额.
 */

let harness: TestCtx;

const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW, platform: 'h5' });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  harness.clock.set(NOW);
  // Idempotent, and the point of this file: the registration under test.
  registerOrderDomain();
});

let sequence = 0;

async function makeUser(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(users)
    .values({ account: `stats-${String(sequence)}` })
    .returning({ id: users.id });
  return row!.id;
}

type OrderShape = {
  status?: 'pending_payment' | 'paid' | 'shipped' | 'received' | 'completed' | 'cancelled';
  paidAmount?: string;
  refundStatus?: 'none' | 'requested' | 'partially_refunded' | 'refunded';
  refundedAmount?: string;
  deleted?: boolean;
  hiddenByUser?: boolean;
};

/**
 * One order, shaped by hand.
 *
 * `orders_paid_shape` is a CHECK: a `pending_payment` / `cancelled` row has
 * neither `paid_at` nor `paid_amount`, and every other status has both. So the
 * fixture cannot express an impossible order even by accident, which is what
 * makes "an unpaid order does not count" a statement about the rule rather
 * than about the fixture.
 */
async function makeOrder(userId: number, shape: OrderShape): Promise<void> {
  sequence += 1;
  const status = shape.status ?? 'paid';
  const unpaid = status === 'pending_payment' || status === 'cancelled';
  const paidAmount = shape.paidAmount ?? '100.00';
  const at = new Date(NOW);
  await harness.ctx.db.insert(orders).values({
    orderNo: `20260601${String(sequence).padStart(16, '0')}`,
    userId,
    platform: 'h5',
    status,
    totalQuantity: 1,
    itemsAmount: paidAmount,
    payableAmount: paidAmount,
    ...(unpaid ? {} : { paidAmount, paidAt: at }),
    ...(status === 'cancelled' ? { cancelledAt: at } : {}),
    // `orders_fulfillment_matches_status`: a shipped order and everything after
    // it has been handed over.
    ...(status === 'shipped' || status === 'received' || status === 'completed'
      ? { fulfillmentStatus: 'fulfilled' as const, shippedAt: at }
      : {}),
    refundStatus: shape.refundStatus ?? 'none',
    refundedAmount: shape.refundedAmount ?? '0.00',
    receiverName: '张三',
    receiverPhone: '13800138000',
    receiverProvince: '浙江省',
    receiverCity: '杭州市',
    receiverDetail: '文三路 100 号',
    createdAt: at,
    ...(shape.deleted === true ? { deletedAt: at } : {}),
    ...(shape.hiddenByUser === true ? { hiddenByUserAt: at } : {}),
  });
}

describe('statsForUsers — 哪些订单算数', () => {
  it('counts the paid order and ignores the unpaid and the fully refunded one', async () => {
    const userId = await makeUser();
    await makeOrder(userId, { status: 'paid', paidAmount: '3980.00' });
    await makeOrder(userId, { status: 'pending_payment', paidAmount: '500.00' });
    await makeOrder(userId, {
      status: 'received',
      paidAmount: '600.00',
      refundStatus: 'refunded',
      refundedAmount: '600.00',
    });

    const stats = await repo.statsForUsers(harness.ctx.db, [userId]);

    expect(stats.get(userId)).toEqual({ orderCount: 1, spendTotal: '3980.00' });
  });

  it('keeps a partially refunded order at what the gateway took, not net of the refund', async () => {
    const userId = await makeUser();
    await makeOrder(userId, {
      status: 'shipped',
      paidAmount: '200.00',
      refundStatus: 'partially_refunded',
      refundedAmount: '50.00',
    });

    // 150.00 would be a third definition of 消费总额; the console's 营业额 sums
    // this same column and reports the 50.00 as a refund of its own.
    expect((await repo.statsForUsers(harness.ctx.db, [userId])).get(userId)).toEqual({
      orderCount: 1,
      spendTotal: '200.00',
    });
  });

  it('drops a cancelled and an admin-deleted order, and keeps one the buyer hid', async () => {
    const userId = await makeUser();
    await makeOrder(userId, { status: 'cancelled', paidAmount: '70.00' });
    await makeOrder(userId, { status: 'completed', paidAmount: '80.00', deleted: true });
    await makeOrder(userId, { status: 'completed', paidAmount: '90.00', hiddenByUser: true });

    // 删除订单 on the storefront is visibility only: the shopper tidied their
    // own list, they did not un-spend the money.
    expect((await repo.statsForUsers(harness.ctx.db, [userId])).get(userId)).toEqual({
      orderCount: 1,
      spendTotal: '90.00',
    });
  });

  it('adds several qualifying orders up across statuses', async () => {
    const userId = await makeUser();
    await makeOrder(userId, { status: 'paid', paidAmount: '0.01' });
    await makeOrder(userId, { status: 'shipped', paidAmount: '12.30' });
    await makeOrder(userId, { status: 'received', paidAmount: '7.69' });
    await makeOrder(userId, { status: 'completed', paidAmount: '80.00' });

    expect((await repo.statsForUsers(harness.ctx.db, [userId])).get(userId)).toEqual({
      orderCount: 4,
      spendTotal: '100.00',
    });
  });

  it('answers a whole page of customers from one call, leaving the ones with nothing out', async () => {
    const buyer = await makeUser();
    const other = await makeUser();
    const browser = await makeUser();
    await makeOrder(buyer, { status: 'paid', paidAmount: '10.00' });
    await makeOrder(other, { status: 'completed', paidAmount: '20.50' });
    await makeOrder(browser, { status: 'pending_payment', paidAmount: '99.00' });

    const stats = await repo.statsForUsers(harness.ctx.db, [buyer, other, browser, buyer]);

    expect(stats.get(buyer)).toEqual({ orderCount: 1, spendTotal: '10.00' });
    expect(stats.get(other)).toEqual({ orderCount: 1, spendTotal: '20.50' });
    // Absent, not `{0, "0.00"}` — the caller is the one that decides zero.
    expect(stats.has(browser)).toBe(false);
    expect(stats.size).toBe(2);
  });

  it('asks nothing of the database for an empty page', async () => {
    expect(await repo.statsForUsers(harness.ctx.db, [])).toEqual(new Map());
  });
});

describe('registerOrderDomain — the user order stats port', () => {
  it('registers UserOrderStatsPort', async () => {
    const userId = await makeUser();
    await makeOrder(userId, { status: 'completed', paidAmount: '3980.00' });

    const port = getUserOrderStatsPort();
    expect(port).toBeDefined();

    // Through the port, on the caller's own handle.
    const stats = await port!.statsFor(harness.ctx.db, [userId]);
    expect(stats.get(userId)).toEqual({ orderCount: 1, spendTotal: '3980.00' });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders } from '@shop/db/schema/order';
import { refunds } from '@shop/db/schema/refund';
import { users } from '@shop/db/schema/user';
import { createTestCtx, type TestCtx } from '@shop/testing';
import type { Actor, Ctx } from '../kernel/context';
import { registerRefundDomain } from '../refund';
import { orderStaffConfig } from './order.fulfil.config';
import * as orderStaff from './order.staff.service';

/**
 * The 商家管理 console's own two additions (CR-4-h §1 and §2).
 *
 * 统计明细 needs a real database for one reason: the day boundary. A day is
 * Asia/Shanghai's, and the rows are bucketed by PostgreSQL from a `timestamptz`
 * column, so an order placed at 16:30 UTC belongs to *tomorrow* in the shop's
 * books. No amount of JavaScript-side arithmetic proves that; the server has to
 * be asked.
 *
 * 售后备注 needs one because the whole decision is *where the note goes*: into
 * `refund_logs`, appended, rather than over the console's single
 * `refunds.admin_remark` column.
 */

let harness: TestCtx;

/** 2026-06-01 08:00 in Asia/Shanghai — mid-morning, comfortably inside one local day. */
const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW, platform: 'h5' });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  // Config reads are cached in Redis; a switch one case turned on must not
  // outlive the rows the truncate just removed.
  await harness.redis.flushdb();
  harness.clock.set(NOW);
  // The staff refund routes forward into stream C through a port; without this
  // they answer INTERNAL, which is the deliberate failure mode.
  registerRefundDomain();
});

let sequence = 0;

/** What `handle()` builds for an `auth: 'staff'` route: a user, with no permission atoms. */
const staffActor = (id: number): Actor => ({ kind: 'staff', id, permissions: [], isSuper: false });
const asStaff = (userId: number): Ctx => harness.as(staffActor(userId));

async function makeUser(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(users)
    .values({ account: `staff-${sequence}` })
    .returning({ id: users.id });
  return row!.id;
}

/**
 * An order stamped at a chosen instant.
 *
 * `orders.created_at` defaults to the database's `now()`, which a fixed test
 * clock has no say over, so the column is written explicitly — that is the
 * whole point of these cases.
 */
async function makeOrderAt(
  userId: number,
  createdAt: string,
  options: { paidAmount?: string } = {},
): Promise<void> {
  sequence += 1;
  const paid = options.paidAmount;
  await harness.ctx.db.insert(orders).values({
    orderNo: `20260601000000${String(sequence).padStart(3, '0')}0000001`,
    userId,
    platform: 'h5',
    totalQuantity: 1,
    itemsAmount: paid ?? '0.00',
    payableAmount: paid ?? '0.00',
    ...(paid === undefined
      ? {}
      : { paidAmount: paid, paidAt: new Date(createdAt), status: 'paid' }),
    receiverName: '张三',
    receiverPhone: '13800138000',
    receiverProvince: '浙江省',
    receiverCity: '杭州市',
    receiverDetail: '文三路 100 号',
    createdAt: new Date(createdAt),
  });
}

describe('统计明细 — the per-day series', () => {
  it('buckets by the shop’s day, not by UTC', async () => {
    const userId = await makeUser();
    // 23:30 and 00:30 Asia/Shanghai on either side of one midnight, written as
    // the UTC instants they actually are: both land in the *same* UTC day.
    await makeOrderAt(userId, '2026-05-31T15:30:00.000Z', { paidAmount: '10.00' }); // 06-01 23:30
    await makeOrderAt(userId, '2026-05-31T16:30:00.000Z', { paidAmount: '20.00' }); // 06-02 00:30

    const series = await orderStaff.statisticsSeries(asStaff(userId), {
      from: '2026-05-31',
      to: '2026-06-01',
      granularity: 'day',
    });

    expect(series.items).toEqual([
      { date: '2026-05-31', orderCount: 1, paidOrderCount: 1, paidAmount: '10.00' },
      { date: '2026-06-01', orderCount: 1, paidOrderCount: 1, paidAmount: '20.00' },
    ]);
  });

  it('fills the days nothing happened on', async () => {
    const userId = await makeUser();
    await makeOrderAt(userId, '2026-05-20T02:00:00.000Z', { paidAmount: '5.50' });

    const series = await orderStaff.statisticsSeries(asStaff(userId), {
      from: '2026-05-19',
      to: '2026-05-22',
      granularity: 'day',
    });

    expect(series).toMatchObject({ granularity: 'day', from: '2026-05-19', to: '2026-05-22' });
    expect(series.items.map((item) => item.date)).toEqual([
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
    ]);
    expect(series.items[0]).toEqual({
      date: '2026-05-19',
      orderCount: 0,
      paidOrderCount: 0,
      paidAmount: '0.00',
    });
    // `sum()` of numeric comes back unpadded; the wire always carries two digits.
    expect(series.items[1]?.paidAmount).toBe('5.50');
  });

  it('counts an unpaid order without counting its money', async () => {
    const userId = await makeUser();
    await makeOrderAt(userId, '2026-05-20T02:00:00.000Z');
    await makeOrderAt(userId, '2026-05-20T03:00:00.000Z', { paidAmount: '40.00' });

    const series = await orderStaff.statisticsSeries(asStaff(userId), {
      from: '2026-05-20',
      to: '2026-05-20',
      granularity: 'day',
    });
    expect(series.items).toEqual([
      { date: '2026-05-20', orderCount: 2, paidOrderCount: 1, paidAmount: '40.00' },
    ]);
  });

  it('ignores an order the console deleted', async () => {
    const userId = await makeUser();
    await makeOrderAt(userId, '2026-05-20T02:00:00.000Z', { paidAmount: '40.00' });
    await harness.ctx.db.update(orders).set({ deletedAt: new Date(NOW) });

    const series = await orderStaff.statisticsSeries(asStaff(userId), {
      from: '2026-05-20',
      to: '2026-05-20',
      granularity: 'day',
    });
    expect(series.items).toEqual([
      { date: '2026-05-20', orderCount: 0, paidOrderCount: 0, paidAmount: '0.00' },
    ]);
  });

  it('defaults to the last 30 days, ending today in Asia/Shanghai', async () => {
    const userId = await makeUser();

    const series = await orderStaff.statisticsSeries(asStaff(userId), { granularity: 'day' });

    // NOW is 2026-06-01T00:00Z, which is 08:00 on 06-01 in the shop's day.
    expect(series.to).toBe('2026-06-01');
    expect(series.from).toBe('2026-05-03');
    expect(series.items).toHaveLength(30);
  });

  it('swaps a window whose ends arrived the wrong way round', async () => {
    const userId = await makeUser();
    const series = await orderStaff.statisticsSeries(asStaff(userId), {
      from: '2026-05-22',
      to: '2026-05-20',
      granularity: 'day',
    });
    expect(series).toMatchObject({ from: '2026-05-20', to: '2026-05-22' });
    expect(series.items).toHaveLength(3);
  });

  it('refuses a window wider than the cap instead of shortening it', async () => {
    const userId = await makeUser();

    // 92 days inclusive is the widest that answers.
    const widest = await orderStaff.statisticsSeries(asStaff(userId), {
      from: '2026-03-02',
      to: '2026-06-01',
      granularity: 'day',
    });
    expect(widest.items).toHaveLength(92);

    await expect(
      orderStaff.statisticsSeries(asStaff(userId), {
        from: '2026-03-01',
        to: '2026-06-01',
        granularity: 'day',
      }),
    ).rejects.toMatchObject({
      code: 'ORDER_STATISTICS_RANGE_TOO_WIDE',
      details: { maximumDays: 92, requestedDays: 93 },
    });
  });
});

// ---------------------------------------------------------------------------
// 售后备注 (CR-4-h §2)
// ---------------------------------------------------------------------------

/** A minimal order, since a refund's detail joins to one. */
async function makeOrder(userId: number): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(orders)
    .values({
      orderNo: `20260601000000${String(sequence).padStart(3, '0')}0000002`,
      userId,
      platform: 'h5',
      status: 'paid',
      totalQuantity: 1,
      itemsAmount: '60.00',
      payableAmount: '60.00',
      paidAmount: '60.00',
      paidAt: new Date(NOW),
      receiverName: '张三',
      receiverPhone: '13800138000',
      receiverProvince: '浙江省',
      receiverCity: '杭州市',
      receiverDetail: '文三路 100 号',
    })
    .returning({ id: orders.id });
  return row!.id;
}

async function makeRefund(userId: number, orderId: number): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(refunds)
    .values({
      refundNo: `R2026060100000${String(sequence).padStart(3, '0')}`,
      outRefundNo: `RX2026060100000${String(sequence).padStart(3, '0')}`,
      orderId,
      userId,
      kind: 'refund_only',
      quantity: 1,
      amount: '60.00',
      reason: '不想要了',
    })
    .returning({ id: refunds.id });
  return row!.id;
}

describe('售后备注 — a staff note on a refund', () => {
  it('appends to the log and moves nothing else', async () => {
    const userId = await makeUser();
    const refundId = await makeRefund(userId, await makeOrder(userId));

    const detail = await orderStaff.refundRemark(
      asStaff(userId),
      { id: String(refundId) },
      {
        remark: '已电话联系买家',
      },
    );

    expect(detail.status).toBe('applied');
    // The console's column is untouched — that is the whole point of the decision.
    expect(detail.adminRemark).toBeNull();
    expect(detail.logs).toEqual([
      { toStatus: 'applied', message: '店员备注：已电话联系买家', createdAt: expect.any(String) },
    ]);

    const [row] = await harness.ctx.db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(row!.adminRemark).toBeNull();
    expect(row!.status).toBe('applied');
  });

  it('keeps both notes when two people remark', async () => {
    const userId = await makeUser();
    const other = await makeUser();
    const refundId = await makeRefund(userId, await makeOrder(userId));

    await orderStaff.refundRemark(asStaff(userId), { id: String(refundId) }, { remark: '第一条' });
    const detail = await orderStaff.refundRemark(
      asStaff(other),
      { id: String(refundId) },
      { remark: '第二条' },
    );

    expect(detail.logs.map((entry) => entry.message)).toEqual([
      '店员备注：第一条',
      '店员备注：第二条',
    ]);
  });

  it('refuses a refund that does not exist', async () => {
    const userId = await makeUser();
    await expect(
      orderStaff.refundRemark(asStaff(userId), { id: '999999' }, { remark: '无主备注' }),
    ).rejects.toMatchObject({ code: 'REFUND_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// 售后 审核 from the phone (CR-14-k)
// ---------------------------------------------------------------------------

describe('CR-14-k — the staff after-sales screen answers a staff member', () => {
  // Every one of these used to be FORBIDDEN for every staff user: the port
  // forwarded into the admin services, which demand an admin atom.
  it('lists and reads the after-sales', async () => {
    const userId = await makeUser();
    const refundId = await makeRefund(userId, await makeOrder(userId));

    const list = await orderStaff.refundList(asStaff(userId), { page: 1, pageSize: 20 });
    expect(list.items.map((item) => item.id)).toEqual([String(refundId)]);
    const detail = await orderStaff.refundDetail(asStaff(userId), { id: String(refundId) });
    expect(detail.status).toBe('applied');
  });

  it('refuses 同意 and 拒绝 while the shop has not turned staff review on, and moves nothing', async () => {
    const userId = await makeUser();
    const refundId = await makeRefund(userId, await makeOrder(userId));

    for (const body of [
      { decision: 'approve' as const },
      { decision: 'reject' as const, reason: '不符合条件' },
    ]) {
      await expect(
        orderStaff.refundReview(asStaff(userId), { id: String(refundId) }, body),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', details: { reason: '店员审核售后未开启' } });
    }
    const [row] = await harness.ctx.db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(row!.status).toBe('applied');
    expect(row!.reviewedAt).toBeNull();
  });

  it('approves once the switch is on, attributed to the staff user rather than an admin', async () => {
    await harness.ctx.config.set(orderStaffConfig, { allowStaffRefundReview: true });
    const userId = await makeUser();
    const refundId = await makeRefund(userId, await makeOrder(userId));

    const detail = await orderStaff.refundReview(
      asStaff(userId),
      { id: String(refundId) },
      { decision: 'approve', reason: '已核实' },
    );

    expect(detail.status).toBe('approved');
    expect(detail.logs.map((entry) => entry.message)).toContain('店员同意退款：已核实');
    const [row] = await harness.ctx.db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(row!.reviewedByAdminId).toBeNull();
  });

  it('rejects once the switch is on', async () => {
    await harness.ctx.config.set(orderStaffConfig, { allowStaffRefundReview: true });
    const userId = await makeUser();
    const refundId = await makeRefund(userId, await makeOrder(userId));

    const detail = await orderStaff.refundReview(
      asStaff(userId),
      { id: String(refundId) },
      { decision: 'reject', reason: '商品已签收超过 7 天' },
    );

    expect(detail.status).toBe('rejected');
    expect(detail.rejectReason).toBe('商品已签收超过 7 天');
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { orders } from '@shop/db/schema/order';
import { refundLogs, refunds } from '@shop/db/schema/refund';
import { users } from '@shop/db/schema/user';
import {
  AdminAuthService,
  registerUserLookup,
  resetUserLookup,
  UserSessionService,
} from '@shop/core/auth';
import { orderStaffConfig } from '@shop/core/order';
import { createTestCtx, fakeUserLookup, type TestCtx } from '@shop/testing';
import { setContainer, type Container } from '../../../../../src/server/container';
import type { Env } from '../../../../../src/server/env';

/**
 * 移动端商家管理 — 售后 as HTTP (CR-14-k).
 *
 * Before CR-14-k every one of these four routes answered 403 to every staff
 * member: they forwarded into the admin refund services, which demand an admin
 * atom that `handle()`'s staff actor (`permissions: []`) can never hold. The
 * behaviour is pinned in `packages/core/src/refund/refund.permissions.int.test.ts`
 * and `packages/core/src/order/order.staff.int.test.ts`; what is proved here is
 * the whole path — `auth: 'staff'`, the port, the refund domain's staff entry
 * points — through the route files, and that it still fails closed for a
 * shopper who is not on the staff list.
 */

let harness: TestCtx;

const ORIGIN = 'https://shop.example';
const NOW = '2026-06-01T00:00:00.000Z';

const env: Env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  REDIS_URL: 'unused',
  UPLOADS_DIR: '/tmp/uploads',
  UPLOADS_PUBLIC_PREFIX: '/uploads',
  APP_ORIGIN: ORIGIN,
  EXTRA_ALLOWED_ORIGINS: [],
  LOG_LEVEL: 'silent',
  LOG_PRETTY: false,
  VALIDATE_RESPONSES: true,
  DB_POOL_MAX: 5,
  QUEUE_NAME: 'shop',
  APP_VERSION: 'test',
};

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW, platform: 'h5' });
  const container: Container = {
    env,
    dbHandle: harness.db.handle,
    db: harness.ctx.db,
    redis: harness.redis,
    clock: harness.clock,
    logger: harness.ctx.logger,
    queue: harness.ctx.queue,
    storage: harness.ctx.storage,
    config: harness.ctx.config,
    adminAuth: new AdminAuthService(harness.ctx, { bcryptCost: 4 }),
    userSessions: new UserSessionService(),
    close: async () => {},
  };
  setContainer(container);
}, 180_000);

afterAll(async () => {
  setContainer(undefined);
  resetUserLookup();
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const json = (path: string, body: unknown, headers: Record<string, string>) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { headers });

const route = (id: string) => ({ params: Promise.resolve({ id }) });

const codeOf = async (response: Response) => (await response.json()).code;

let sequence = 0;

/** A signed-in storefront shopper. Not staff until `staff()` puts them on the list. */
async function shopper(): Promise<{ userId: number; headers: Record<string, string> }> {
  sequence += 1;
  const [user] = await harness.ctx.db
    .insert(users)
    .values({ account: `refund-shopper-${sequence}` })
    .returning({ id: users.id });
  registerUserLookup(fakeUserLookup([{ id: user!.id }]));
  const issued = await new UserSessionService().issue(harness.ctx, {
    userId: user!.id,
    passwordVersion: 1,
    platform: 'h5',
  });
  return {
    userId: user!.id,
    headers: { authorization: `Bearer ${issued.token}`, 'x-client-platform': 'h5' },
  };
}

async function staff(
  options: { review?: boolean } = {},
): Promise<{ userId: number; headers: Record<string, string> }> {
  const who = await shopper();
  await harness.ctx.config.set(orderStaffConfig, {
    staffUserIds: [who.userId],
    allowStaffRefundReview: options.review ?? false,
  });
  return who;
}

/** A paid order and an `applied` 仅退款 on it, owned by a separate buyer. */
async function appliedRefund(): Promise<number> {
  sequence += 1;
  const [buyer] = await harness.ctx.db
    .insert(users)
    .values({ account: `refund-buyer-${sequence}` })
    .returning({ id: users.id });
  const [order] = await harness.ctx.db
    .insert(orders)
    .values({
      orderNo: `20260601000000${String(sequence).padStart(3, '0')}0000003`,
      userId: buyer!.id,
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
  const [refund] = await harness.ctx.db
    .insert(refunds)
    .values({
      refundNo: `R2026060100000${String(sequence).padStart(3, '0')}`,
      outRefundNo: `RX2026060100000${String(sequence).padStart(3, '0')}`,
      orderId: order!.id,
      userId: buyer!.id,
      kind: 'refund_only',
      quantity: 1,
      amount: '60.00',
      reason: '不想要了',
    })
    .returning({ id: refunds.id });
  return refund!.id;
}

// `apps/web` does not depend on drizzle-orm directly, so rows are filtered here.
const statusOf = async (refundId: number) =>
  (await harness.ctx.db.select().from(refunds)).find((row) => row.id === refundId)!.status;

// ---------------------------------------------------------------------------

describe('GET /api/v1/staff/refunds', () => {
  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    await appliedRefund();
    const { GET } = await import('./route');
    const response = await GET(get('/api/v1/staff/refunds?page=1&pageSize=20', headers));
    expect(response.status).toBe(403);
    expect(await codeOf(response)).toBe('FORBIDDEN');
  });

  it('serves a staff member the list', async () => {
    const { headers } = await staff();
    const refundId = await appliedRefund();
    const { GET } = await import('./route');
    const response = await GET(get('/api/v1/staff/refunds?page=1&pageSize=20', headers));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { id: string }) => item.id)).toEqual([String(refundId)]);
  });
});

describe('GET /api/v1/staff/refunds/:id', () => {
  it('serves a staff member the detail', async () => {
    const { headers } = await staff();
    const refundId = await appliedRefund();
    const { GET } = await import('./[id]/route');
    const response = await GET(
      get(`/api/v1/staff/refunds/${refundId}`, headers),
      route(String(refundId)),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: String(refundId), status: 'applied' });
  });
});

describe('POST /api/v1/staff/refunds/:id/review', () => {
  it('403s a shopper who is not on the staff list, and moves nothing', async () => {
    const { headers } = await shopper();
    await harness.ctx.config.set(orderStaffConfig, { allowStaffRefundReview: true });
    const refundId = await appliedRefund();
    const { POST } = await import('./[id]/review/route');
    const response = await POST(
      json(`/api/v1/staff/refunds/${refundId}/review`, { decision: 'approve' }, headers),
      route(String(refundId)),
    );
    expect(response.status).toBe(403);
    expect(await statusOf(refundId)).toBe('applied');
  });

  it('403s a staff member while staff review is off, saying so', async () => {
    const { headers } = await staff();
    const refundId = await appliedRefund();
    const { POST } = await import('./[id]/review/route');
    const response = await POST(
      json(`/api/v1/staff/refunds/${refundId}/review`, { decision: 'approve' }, headers),
      route(String(refundId)),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: '店员审核售后未开启' },
    });
    expect(await statusOf(refundId)).toBe('applied');
  });

  it('lets a staff member approve once the shop turns it on', async () => {
    const { userId, headers } = await staff({ review: true });
    const refundId = await appliedRefund();
    const { POST } = await import('./[id]/review/route');
    const response = await POST(
      json(`/api/v1/staff/refunds/${refundId}/review`, { decision: 'approve' }, headers),
      route(String(refundId)),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'approved' });
    const logs = (await harness.ctx.db.select().from(refundLogs)).filter(
      (log) => log.refundId === refundId,
    );
    expect(logs.find((log) => log.toStatus === 'approved')).toMatchObject({
      operatorUserId: userId,
      operatorAdminId: null,
    });
  });

  it('lets a staff member reject with a reason once the shop turns it on', async () => {
    const { headers } = await staff({ review: true });
    const refundId = await appliedRefund();
    const { POST } = await import('./[id]/review/route');
    const response = await POST(
      json(
        `/api/v1/staff/refunds/${refundId}/review`,
        { decision: 'reject', reason: '商品已签收超过 7 天' },
        headers,
      ),
      route(String(refundId)),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'rejected',
      rejectReason: '商品已签收超过 7 天',
    });
  });
});

describe('POST /api/v1/staff/refunds/:id/remark', () => {
  it('appends a staff note', async () => {
    const { headers } = await staff();
    const refundId = await appliedRefund();
    const { POST } = await import('./[id]/remark/route');
    const response = await POST(
      json(`/api/v1/staff/refunds/${refundId}/remark`, { remark: '已电话联系买家' }, headers),
      route(String(refundId)),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.logs.map((entry: { message: string }) => entry.message)).toContain(
      '店员备注：已电话联系买家',
    );
  });
});

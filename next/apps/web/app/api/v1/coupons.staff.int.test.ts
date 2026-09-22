import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { couponTemplates, userCoupons } from '@shop/db/schema/coupon';
import { orders } from '@shop/db/schema/order';
import { users } from '@shop/db/schema/user';
import {
  AdminAuthService,
  registerUserLookup,
  resetUserLookup,
  UserSessionService,
} from '@shop/core/auth';
import { orderStaffConfig } from '@shop/core/order';
import { createTestCtx, fakeUserLookup, type TestCtx } from '@shop/testing';
import { setContainer, type Container } from '../../../src/server/container';
import type { Env } from '../../../src/server/env';

/**
 * 订单赠券 and 店员发券 as HTTP (CR-5-h2).
 *
 * These three routes are worth testing at this layer rather than in
 * `@shop/core`, because in all three the interesting decision is one a route
 * test can see and a service test cannot:
 *
 *  - `GET /api/v1/orders/:id/gift-coupons` must answer a stranger with the same
 *    `404` as an unknown id. A service test asserting `ORDER_NOT_FOUND` proves
 *    the throw; only the HTTP round trip proves the *status*, and 403-vs-404 is
 *    the whole point — a 403 would confirm the order exists.
 *  - the two `/api/v1/staff/*` routes are gated by `auth: 'staff'`, which
 *    `handle()` resolves from the `order-staff` roster before any service runs.
 *    An ordinary shopper with a perfectly good session must get `403`.
 *
 * The container runs with `VALIDATE_RESPONSES` on, as CI does, so a response
 * that does not match the contract fails here rather than in a client.
 */

let harness: TestCtx;

const ORIGIN = 'https://shop.example';

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
  harness = await createTestCtx({ now: '2026-06-01T00:00:00.000Z', platform: 'h5' });
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
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      'x-client-platform': 'h5',
      ...headers,
    },
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { headers: { 'x-client-platform': 'h5', ...headers } });

let sequence = 0;
const sessions = new UserSessionService();

/** Every user created so far, so `fakeUserLookup` keeps resolving the earlier ones. */
const known: { id: number }[] = [];

async function shopper(): Promise<{ userId: number; headers: Record<string, string> }> {
  sequence += 1;
  const [user] = await harness.ctx.db
    .insert(users)
    .values({ account: `shopper-${sequence}` })
    .returning({ id: users.id });
  known.push({ id: user!.id });
  registerUserLookup(fakeUserLookup([...known]));
  const issued = await sessions.issue(harness.ctx, {
    userId: user!.id,
    passwordVersion: 1,
    platform: 'h5',
  });
  return { userId: user!.id, headers: { authorization: `Bearer ${issued.token}` } };
}

/** The same, on the `order-staff` roster, which is what `auth: 'staff'` reads. */
async function staff(): Promise<{ userId: number; headers: Record<string, string> }> {
  const session = await shopper();
  await harness.ctx.config.set(orderStaffConfig, { staffUserIds: [session.userId] });
  return session;
}

async function makeOrder(userId: number): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(orders)
    .values({
      orderNo: `2026060100000${String(sequence).padStart(7, '0')}`,
      userId,
      platform: 'h5',
      status: 'paid',
      totalQuantity: 1,
      itemsAmount: '100.00',
      payableAmount: '100.00',
      // `orders_paid_shape`: anything past `pending_payment` carries both of these.
      paidAmount: '100.00',
      paidAt: new Date('2026-06-01T00:00:00.000Z'),
      receiverName: '张三',
      receiverPhone: '13800138000',
      receiverProvince: '浙江省',
      receiverCity: '杭州市',
      receiverDetail: '文三路 100 号',
    })
    .returning({ id: orders.id });
  return row!.id;
}

/** An `active` template with supply, i.e. one the staff console may hand out. */
async function makeTemplate(name: string, overrides: Record<string, unknown> = {}) {
  const [row] = await harness.ctx.db
    .insert(couponTemplates)
    .values({
      name,
      scope: 'all_products',
      claimMode: 'admin_grant',
      status: 'active',
      discountAmount: '10.00',
      minSpend: '100.00',
      validityMode: 'fixed_window',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: new Date('2026-12-31T00:00:00.000Z'),
      isUnlimitedSupply: false,
      totalCount: 100,
      remainingCount: 100,
      perUserLimit: 1,
      ...overrides,
    })
    .returning({ id: couponTemplates.id });
  return row!.id;
}

/** What is left of one template's supply. */
async function remaining(templateId: number): Promise<number | null> {
  const rows = await harness.ctx.db.select().from(couponTemplates);
  return rows.find((row) => row.id === templateId)?.remainingCount ?? null;
}

// ---------------------------------------------------------------------------
// 订单赠券
// ---------------------------------------------------------------------------

describe('GET /api/v1/orders/:id/gift-coupons', () => {
  it('401s without a session', async () => {
    const { GET } = await import('./orders/[id]/gift-coupons/route');
    const response = await GET(get('/api/v1/orders/1/gift-coupons'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(response.status).toBe(401);
  });

  it('lists the coupons the order earned', async () => {
    const buyer = await shopper();
    const orderId = await makeOrder(buyer.userId);
    const first = await makeTemplate('满 100 减 10');
    const second = await makeTemplate('满 200 减 30', {
      discountAmount: '30.00',
      minSpend: '200.00',
    });
    for (const [slot, templateId] of [first, second].entries()) {
      await harness.ctx.db.insert(userCoupons).values({
        templateId,
        userId: buyer.userId,
        claimSlot: slot + 1,
        title: `赠券 ${templateId}`,
        discountAmount: '10.00',
        minSpend: '100.00',
        sourceKind: 'gift_order',
        sourceOrderId: orderId,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validTo: new Date('2026-12-31T00:00:00.000Z'),
      });
    }

    const { GET } = await import('./orders/[id]/gift-coupons/route');
    const response = await GET(get(`/api/v1/orders/${orderId}/gift-coupons`, buyer.headers), {
      params: Promise.resolve({ id: String(orderId) }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { sourceKind: string }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items.every((item) => item.sourceKind === 'gift_order')).toBe(true);
  });

  /** An order that earned nothing is a fact, not a failure — the page still asks. */
  it('answers an empty list rather than a 404 when the order earned nothing', async () => {
    const buyer = await shopper();
    const orderId = await makeOrder(buyer.userId);

    const { GET } = await import('./orders/[id]/gift-coupons/route');
    const response = await GET(get(`/api/v1/orders/${orderId}/gift-coupons`, buyer.headers), {
      params: Promise.resolve({ id: String(orderId) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
  });

  it('gives a stranger the same 404 as an unknown order', async () => {
    const buyer = await shopper();
    const orderId = await makeOrder(buyer.userId);
    const stranger = await shopper();

    const { GET } = await import('./orders/[id]/gift-coupons/route');
    const mine = await GET(get(`/api/v1/orders/${orderId}/gift-coupons`, stranger.headers), {
      params: Promise.resolve({ id: String(orderId) }),
    });
    const nobodys = await GET(get('/api/v1/orders/999999/gift-coupons', stranger.headers), {
      params: Promise.resolve({ id: '999999' }),
    });

    expect(mine.status).toBe(404);
    expect(nobodys.status).toBe(404);
    expect(await mine.json()).toEqual(await nobodys.json());
  });
});

// ---------------------------------------------------------------------------
// 店员发券
// ---------------------------------------------------------------------------

describe('/api/v1/staff/coupons', () => {
  it('403s for a signed-in shopper who is not on the roster', async () => {
    const buyer = await shopper();
    const { GET } = await import('./staff/coupons/route');
    const response = await GET(get('/api/v1/staff/coupons?page=1&pageSize=20', buyer.headers));
    expect(response.status).toBe(403);
  });

  it('lists the active templates for a staff member, and filters by keyword', async () => {
    const member = await staff();
    await makeTemplate('满 100 减 10');
    await makeTemplate('新人礼', { status: 'draft' });

    const { GET } = await import('./staff/coupons/route');
    const all = await GET(get('/api/v1/staff/coupons?page=1&pageSize=20', member.headers));
    expect(all.status).toBe(200);
    const listed = (await all.json()) as { items: { name: string }[]; total: number };
    // The draft is absent: on the phone the only action is 发放.
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.name).toBe('满 100 减 10');

    const filtered = await GET(
      get('/api/v1/staff/coupons?page=1&pageSize=20&keyword=不存在', member.headers),
    );
    expect(((await filtered.json()) as { total: number }).total).toBe(0);
  });
});

describe('POST /api/v1/staff/coupon-grants', () => {
  it('403s for a signed-in shopper who is not on the roster', async () => {
    const buyer = await shopper();
    const templateId = await makeTemplate('满 100 减 10');
    const { POST } = await import('./staff/coupon-grants/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/coupon-grants',
        { userId: String(buyer.userId), couponId: String(templateId) },
        buyer.headers,
      ),
    );
    expect(response.status).toBe(403);
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(0);
  });

  it('creates exactly one row, and refuses the second grant the way the admin grant does', async () => {
    const member = await staff();
    const customer = await shopper();
    const templateId = await makeTemplate('满 100 减 10');
    const { POST } = await import('./staff/coupon-grants/route');
    const body = { userId: String(customer.userId), couponId: String(templateId) };

    const first = await POST(json('POST', '/api/v1/staff/coupon-grants', body, member.headers));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ granted: 1, skippedUserIds: [] });

    // Not a 409: the customer already holds it up to `per_user_limit`, which is
    // the ordinary outcome of granting twice, and is what the web console says.
    const second = await POST(json('POST', '/api/v1/staff/coupon-grants', body, member.headers));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      granted: 0,
      skippedUserIds: [String(customer.userId)],
    });

    const held = await harness.ctx.db.select().from(userCoupons);
    expect(held).toHaveLength(1);
    expect(held[0]?.userId).toBe(customer.userId);
    expect(held[0]?.templateId).toBe(templateId);
    expect(held[0]?.sourceKind).toBe('admin_grant');

    // …and the supply moved exactly once.
    expect(await remaining(templateId)).toBe(99);
  });

  it('422s on an unknown customer without touching the supply', async () => {
    const member = await staff();
    const templateId = await makeTemplate('满 100 减 10');
    const { POST } = await import('./staff/coupon-grants/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/coupon-grants',
        { userId: '999999', couponId: String(templateId) },
        member.headers,
      ),
    );
    expect(response.status).toBe(422);
    expect(await remaining(templateId)).toBe(100);
  });
});

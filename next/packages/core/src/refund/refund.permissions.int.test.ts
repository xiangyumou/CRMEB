import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { admins } from '@shop/db/schema/auth';
import { products, productSkus } from '@shop/db/schema/catalog';
import { orderItems, orders } from '@shop/db/schema/order';
import { refundLogs, refunds } from '@shop/db/schema/refund';
import { effects as effectsTable } from '@shop/db/schema/system';
import { users } from '@shop/db/schema/user';
import { createTestCtx, flushTestRedis, forkTestCtx, type TestCtx } from '@shop/testing';
import { registerAllDomains } from '../domains.gen';
import type { Actor, Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { resolveStaffRefundPort } from '../order';
import { configGet, configSave } from '../system';
import { refundPermissions } from './permissions';
import * as admin from './refund.admin';
import { refundConfig } from './refund.config';
import * as service from './refund.service';

/**
 * The refund domain's permission atoms, asserted one at a time for an admin
 * who is **not** a super admin.
 *
 * Every other refund test builds its operator with `isSuper: true`. That
 * short-circuits `hasPermission` before it reads a single atom, so nothing
 * there shows what a narrow role can and cannot do (CR-14-k).
 *
 * The staff half is here too: the staff entry points the 商家管理 console is
 * wired to, and the wall between them and the admin services.
 */

let harness: TestCtx;

const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
  registerAllDomains();
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await flushTestRedis(harness.redis);
  harness.clock.set(NOW);
});

/** An admin with a real id and exactly the atoms given. */
const adminWith = (permissions: string[], id = 7): Actor => ({
  kind: 'admin',
  id,
  permissions,
  isSuper: false,
});

const as = (actor: Actor): Ctx => forkTestCtx(harness, { actor });

async function refusalOf(run: () => Promise<unknown>): Promise<DomainError> {
  try {
    const value = await run();
    throw new Error(`expected a refusal, got ${JSON.stringify(value)}`);
  } catch (error) {
    if (!DomainError.is(error)) throw error;
    return error;
  }
}

// ---------------------------------------------------------------------------
// CR-10-k — the 售后设置 group
// ---------------------------------------------------------------------------

describe('CR-10-k — who may rewrite the return address', () => {
  const redirect = { values: { returnAddress: '别处 1 号' } };

  it.each([
    ['the remark atom', ['refund:request:read', 'refund:request:write']],
    ['the review atom', ['refund:request:read', 'refund:request:review']],
    ['the execute atom', ['refund:request:read', 'refund:request:execute']],
    ['reading the group', ['refund:config:read']],
  ])('refuses %s, and the address stays where it was', async (_label, atoms) => {
    const refusal = await refusalOf(() =>
      configSave(as(adminWith(atoms)), { group: 'refund' }, redirect),
    );

    expect(refusal.code).toBe('FORBIDDEN');
    expect(refusal.details).toEqual({ permission: 'refund:config:write' });
    expect((await harness.ctx.config.get(refundConfig)).returnAddress).toBe('');
  });

  it('shows the group to refund:config:read, as read-only', async () => {
    const view = await configGet(as(adminWith(['refund:config:read'])), { group: 'refund' });
    expect(view.descriptor.permission).toBe('refund:config:read');
  });

  it('lets refund:config:write change it', async () => {
    await configSave(
      as(adminWith(['refund:config:read', 'refund:config:write'])),
      { group: 'refund' },
      redirect,
    );

    expect((await harness.ctx.config.get(refundConfig)).returnAddress).toBe('别处 1 号');
  });
});

// ---------------------------------------------------------------------------
// CR-14-k — the request atoms, one at a time
// ---------------------------------------------------------------------------

const ALL_REQUEST_ATOMS = [
  refundPermissions['request:read'],
  refundPermissions['request:review'],
  refundPermissions['request:execute'],
  refundPermissions['request:write'],
];

const userActor = (id: number): Actor => ({ kind: 'user', id, permissions: [], isSuper: false });
/** What `handle()` builds for an `auth: 'staff'` route. */
const staffActor = (id: number): Actor => ({ kind: 'staff', id, permissions: [], isSuper: false });
const superAdmin = (id: number): Actor => ({ kind: 'admin', id, permissions: [], isSuper: true });

interface Scene {
  ownerId: number;
  staffUserId: number;
  adminId: number;
  refundId: number;
}

let sequence = 0;

/** One paid order and one `applied` after-sale on it, of the kind asked for. */
async function scene(kind: 'refund_only' | 'return_and_refund'): Promise<Scene> {
  sequence += 1;
  const n = sequence;
  const db = harness.ctx.db;
  const [owner] = await db
    .insert(users)
    .values({ account: `perm-owner-${n}` })
    .returning({ id: users.id });
  const [staffUser] = await db
    .insert(users)
    .values({ account: `perm-staff-${n}` })
    .returning({ id: users.id });
  const [operator] = await db
    .insert(admins)
    .values({ account: `perm-admin-${n}`, passwordHash: 'x'.repeat(60), name: `运营${n}` })
    .returning({ id: admins.id });
  const [product] = await db
    .insert(products)
    .values({
      name: '权限测试商品',
      imageUrl: 'https://cdn.example.test/p.jpg',
      status: 'on_shelf',
      freightMode: 'free',
      price: '50.00',
    })
    .returning({ id: products.id });
  const [sku] = await db
    .insert(productSkus)
    .values({ productId: product!.id, skuCode: `PERM${n}`, price: '50.00', stock: 100 })
    .returning({ id: productSkus.id });
  const [order] = await db
    .insert(orders)
    .values({
      orderNo: `PM${String(n).padStart(10, '0')}`,
      userId: owner!.id,
      platform: 'wechat_mini',
      status: 'paid',
      totalQuantity: 2,
      itemsAmount: '100.00',
      payableAmount: '100.00',
      paidAmount: '100.00',
      paidAt: harness.clock.now(),
      receiverName: '张三',
      receiverPhone: '13800000000',
      receiverProvince: '广东省',
      receiverCity: '深圳市',
      receiverDetail: '某路 1 号',
    })
    .returning({ id: orders.id });
  const [item] = await db
    .insert(orderItems)
    .values({
      orderId: order!.id,
      productId: product!.id,
      skuId: sku!.id,
      itemKey: 'L1',
      quantity: 2,
      unitPrice: '50.00',
      totalAmount: '100.00',
      snapshot: {
        productName: '权限测试商品',
        productImageUrl: 'https://cdn.example.test/p.jpg',
        productKind: 'physical',
        skuCode: `PERM${n}`,
        specText: '默认',
        specValues: {},
      },
    })
    .returning({ id: orderItems.id });

  const applied = await service.apply(as(userActor(owner!.id)), {
    orderId: String(order!.id),
    kind,
    lines: [{ orderItemId: String(item!.id), quantity: 1 }],
    reason: '不想要了',
    images: [],
    includeFreight: false,
  });

  return {
    ownerId: owner!.id,
    staffUserId: staffUser!.id,
    adminId: operator!.id,
    refundId: Number(applied.id),
  };
}

const refundRow = (id: number) =>
  harness.ctx.db
    .select()
    .from(refunds)
    .where(eq(refunds.id, id))
    .then((rows) => rows[0]!);

const logsOf = (id: number) =>
  harness.ctx.db.select().from(refundLogs).where(eq(refundLogs.refundId, id));

const refundEffects = () =>
  harness.ctx.db.select().from(effectsTable).where(eq(effectsTable.scope, 'refund'));

/** A snapshot of everything an admin action could have written. */
async function written(id: number) {
  return { row: await refundRow(id), logs: await logsOf(id), effects: await refundEffects() };
}

type Act = (ctx: Ctx, id: string) => Promise<unknown>;

/** Every admin action, the atom it needs, and the state it is tried from. */
const ACTIONS: [string, string, 'applied' | 'approved', Act][] = [
  [
    'the list',
    'refund:request:read',
    'applied',
    (ctx) => admin.adminList(ctx, { page: 1, pageSize: 20 }),
  ],
  ['the detail', 'refund:request:read', 'applied', (ctx, id) => admin.adminDetail(ctx, { id })],
  ['同意', 'refund:request:review', 'applied', (ctx, id) => admin.adminApprove(ctx, { id })],
  [
    '拒绝',
    'refund:request:review',
    'applied',
    (ctx, id) => admin.adminReject(ctx, { id, rejectReason: '不符合条件' }),
  ],
  [
    '确认收货',
    'refund:request:execute',
    'approved',
    (ctx, id) => admin.adminReceiveReturn(ctx, { id }),
  ],
  ['重试', 'refund:request:execute', 'approved', (ctx, id) => admin.adminRetry(ctx, { id })],
  [
    '备注',
    'refund:request:write',
    'applied',
    (ctx, id) => admin.adminRemark(ctx, { id, adminRemark: '看一下' }),
  ],
];

async function sceneAt(state: 'applied' | 'approved'): Promise<Scene> {
  const s = await scene('return_and_refund');
  if (state === 'approved') {
    await admin.adminApprove(as(superAdmin(s.adminId)), { id: String(s.refundId) });
  }
  return s;
}

describe('CR-14-k — each refund admin action refused for an admin without its atom', () => {
  it.each(ACTIONS)(
    'refuses %s to an admin holding every other refund atom, and writes nothing',
    async (_label, atom, state, act) => {
      const s = await sceneAt(state);
      const before = await written(s.refundId);
      const others = [...ALL_REQUEST_ATOMS.filter((a) => a !== atom), 'refund:config:write'];

      const refusal = await refusalOf(() =>
        act(as(adminWith(others, s.adminId)), String(s.refundId)),
      );

      expect(refusal.code).toBe('FORBIDDEN');
      expect(refusal.status).toBe(403);
      expect(refusal.details).toEqual({ permission: atom });
      expect(await written(s.refundId)).toEqual(before);
    },
  );

  it.each(ACTIONS.filter(([, atom]) => atom !== 'refund:request:execute'))(
    'serves %s to an admin holding just its atom (and read)',
    async (_label, atom, state, act) => {
      // The refusals above are only worth something if the same call with the
      // atom really gets through. 确认收货 / 重试 are the next describe's.
      const s = await sceneAt(state);
      await expect(
        act(as(adminWith(['refund:request:read', atom], s.adminId)), String(s.refundId)),
      ).resolves.toBeDefined();
    },
  );
});

describe('CR-14-k — review and execute are separate grants', () => {
  it('request:review approves but cannot confirm the goods came back or retry', async () => {
    const s = await scene('return_and_refund');
    const reviewer = as(adminWith(['refund:request:read', 'refund:request:review'], s.adminId));

    await admin.adminApprove(reviewer, { id: String(s.refundId) });
    expect((await refundRow(s.refundId)).status).toBe('approved');
    const before = await written(s.refundId);

    for (const act of [
      () => admin.adminReceiveReturn(reviewer, { id: String(s.refundId) }),
      () => admin.adminRetry(reviewer, { id: String(s.refundId) }),
    ]) {
      const refusal = await refusalOf(act);
      expect(refusal.code).toBe('FORBIDDEN');
      expect(refusal.details).toEqual({ permission: 'refund:request:execute' });
    }
    expect(await written(s.refundId)).toEqual(before);
  });

  it('request:execute confirms the return but cannot approve or reject', async () => {
    const s = await scene('return_and_refund');
    const executor = as(adminWith(['refund:request:read', 'refund:request:execute'], s.adminId));
    const before = await written(s.refundId);

    for (const act of [
      () => admin.adminApprove(executor, { id: String(s.refundId) }),
      () => admin.adminReject(executor, { id: String(s.refundId), rejectReason: '不符合条件' }),
    ]) {
      const refusal = await refusalOf(act);
      expect(refusal.code).toBe('FORBIDDEN');
      expect(refusal.details).toEqual({ permission: 'refund:request:review' });
    }
    expect(await written(s.refundId)).toEqual(before);

    // Once somebody who may review has said yes, the executor does their half.
    await admin.adminApprove(as(superAdmin(s.adminId)), { id: String(s.refundId) });
    await admin.adminReceiveReturn(executor, { id: String(s.refundId) });
    expect((await refundRow(s.refundId)).status).toBe('processing');
  });
});

// ---------------------------------------------------------------------------
// CR-14-k — the staff entry points
// ---------------------------------------------------------------------------

describe('CR-14-k — the staff console and the admin services stay apart', () => {
  it('still refuses a staff actor on every admin service, whatever it is', async () => {
    const s = await sceneAt('applied');
    const before = await written(s.refundId);
    for (const [, atom, , act] of ACTIONS.filter(([, , state]) => state === 'applied')) {
      const refusal = await refusalOf(() => act(as(staffActor(s.staffUserId)), String(s.refundId)));
      expect(refusal.code).toBe('FORBIDDEN');
      expect(refusal.details).toEqual({ permission: atom });
    }
    expect(await written(s.refundId)).toEqual(before);
  });

  it.each([
    ['a super admin', (s: Scene) => superAdmin(s.adminId)],
    ['a shopper', (s: Scene) => userActor(s.ownerId)],
  ])('refuses %s on the staff entry points, and writes nothing', async (_label, actorOf) => {
    const s = await sceneAt('applied');
    const ctx = as(actorOf(s));
    const id = String(s.refundId);
    const before = await written(s.refundId);

    for (const act of [
      () => admin.staffList(ctx, { page: 1, pageSize: 20 }),
      () => admin.staffDetail(ctx, { id }),
      () => admin.staffApprove(ctx, { id }),
      () => admin.staffReject(ctx, { id, rejectReason: '不符合条件' }),
      () => admin.staffRemark(ctx, { id, remark: '看一下' }),
    ]) {
      const refusal = await refusalOf(act);
      expect(refusal.code).toBe('FORBIDDEN');
      expect(refusal.details).toEqual({ reason: 'staff only' });
    }
    expect(await written(s.refundId)).toEqual(before);
  });

  it('is what the staff port is wired to, not the admin services', () => {
    const port = resolveStaffRefundPort();
    expect(port?.list).toBe(admin.staffList);
    expect(port?.detail).toBe(admin.staffDetail);
  });
});

describe('CR-14-k — a staff member reviews through the same transitions', () => {
  it('lists and reads the after-sale', async () => {
    const s = await sceneAt('applied');
    const ctx = as(staffActor(s.staffUserId));

    const list = await admin.staffList(ctx, { page: 1, pageSize: 20 });
    expect(list.items.map((item) => item.id)).toEqual([String(s.refundId)]);
    const detail = await admin.staffDetail(ctx, { id: String(s.refundId) });
    expect(detail.id).toBe(String(s.refundId));
  });

  it('approves a 仅退款: queued for the gateway, attributed to the staff user', async () => {
    const s = await scene('refund_only');

    await admin.staffApprove(as(staffActor(s.staffUserId)), {
      id: String(s.refundId),
      remark: '已核实',
    });

    const row = await refundRow(s.refundId);
    expect(row.status).toBe('approved');
    expect(row.reviewedByAdminId).toBeNull();
    expect(row.reviewedAt).not.toBeNull();
    const approval = (await logsOf(s.refundId)).find((log) => log.toStatus === 'approved');
    expect(approval).toMatchObject({ operatorUserId: s.staffUserId, operatorAdminId: null });
    expect(approval?.message).toMatch(/^店员同意退款：已核实/);
    expect((await refundEffects()).map((effect) => effect.scopeId)).toContain(String(s.refundId));
  });

  it('rejects with the reason, attributed to the staff user', async () => {
    const s = await scene('return_and_refund');

    await admin.staffReject(as(staffActor(s.staffUserId)), {
      id: String(s.refundId),
      rejectReason: '商品已签收超过 7 天',
    });

    const row = await refundRow(s.refundId);
    expect(row.status).toBe('rejected');
    expect(row.rejectReason).toBe('商品已签收超过 7 天');
    expect(row.reviewedByAdminId).toBeNull();
    const rejection = (await logsOf(s.refundId)).find((log) => log.toStatus === 'rejected');
    expect(rejection).toMatchObject({
      operatorUserId: s.staffUserId,
      message: '店员拒绝：商品已签收超过 7 天',
    });
  });

  it('approves a return to the configured address, never one of its own', async () => {
    await harness.ctx.config.set(refundConfig, {
      returnName: '售后部',
      returnPhone: '13800000000',
      returnAddress: '浙江省杭州市西湖区文一西路 1 号',
    });
    const s = await scene('return_and_refund');

    await admin.staffApprove(as(staffActor(s.staffUserId)), {
      id: String(s.refundId),
      // Not part of the staff signature; a caller that smuggles it in is ignored.
      ...({ returnAddress: { name: '别人', phone: '1', address: '别处' } } as object),
    });

    expect((await refundRow(s.refundId)).returnAddress).toEqual({
      name: '售后部',
      phone: '13800000000',
      address: '浙江省杭州市西湖区文一西路 1 号',
    });
  });
});

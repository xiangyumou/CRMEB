import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { productCategories, productCategoriesMap, products } from '@shop/db/schema/catalog';
import { couponTemplates, productGiftCoupons, userCoupons } from '@shop/db/schema/coupon';
import { orders } from '@shop/db/schema/order';
import { users } from '@shop/db/schema/user';
import { createTestCtx, type TestCtx } from '@shop/testing';
import type { CouponTemplateForm } from '@shop/contracts/coupon/schemas';
import { DomainError } from '../kernel/errors';
import { Money } from '../kernel/money';
import type { Actor, Ctx } from '../kernel/context';
import { withTx } from '../kernel/tx';
import * as service from './coupon.service';
import { disableClosedCampaigns, expireOverdueCoupons } from './coupon.jobs';

/**
 * The coupon domain against a real PostgreSQL 17.
 *
 * Everything here needs the database to mean anything: the CHECK constraints,
 * the two unique indexes, and every `conditionalUpdate` whose answer is a row
 * count. The races live next door in `coupon.concurrency.int.test.ts`.
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
  // The clock is shared by every test in the file, and several tests advance
  // it to reach an expiry. Put it back so each test starts from the same day.
  harness.clock.set(NOW);
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userActor = (id: number): Actor => ({
  kind: 'user',
  id,
  permissions: [],
  isSuper: false,
});

/** `ctx` acting as a storefront customer. */
function asUser(id: number): Ctx {
  return harness.as(userActor(id));
}

let sequence = 0;

async function makeUser(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(users)
    .values({ account: `u-${sequence}`, nickname: `顾客${sequence}` })
    .returning({ id: users.id });
  return row!.id;
}

async function makeProduct(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(products)
    .values({
      name: `商品${sequence}`,
      imageUrl: 'https://example.test/p.png',
      // `products_freight_source` insists a `template` product names a template.
      freightMode: 'free',
    })
    .returning({ id: products.id });
  return row!.id;
}

/** `user_coupons.source_order_id` is a real foreign key, so a gift test needs a real order. */
async function makeOrder(userId: number): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(orders)
    .values({
      orderNo: `SO${sequence}`,
      userId,
      platform: 'h5',
      status: 'paid',
      totalQuantity: 1,
      itemsAmount: '500.00',
      payableAmount: '500.00',
      paidAmount: '500.00',
      paidAt: harness.clock.now(),
      receiverName: '张三',
      receiverPhone: '13800000000',
      receiverProvince: '广东省',
      receiverCity: '深圳市',
      receiverDetail: '某路 1 号',
    })
    .returning({ id: orders.id });
  return row!.id;
}

/** A root category, with `productIds` filed under it. */
async function makeCategory(productIds: readonly number[] = []): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(productCategories)
    .values({ name: `分类${sequence}` })
    .returning({ id: productCategories.id });
  if (productIds.length > 0) {
    await harness.ctx.db
      .insert(productCategoriesMap)
      .values(productIds.map((productId) => ({ productId, categoryId: row!.id })));
  }
  return row!.id;
}

type TemplateValues = typeof couponTemplates.$inferInsert;

/** A live, manually-claimable, ¥10-off template with 5 in stock. */
async function makeTemplate(overrides: Partial<TemplateValues> = {}): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(couponTemplates)
    .values({
      name: `券${sequence}`,
      status: 'active',
      claimMode: 'manual',
      discountAmount: '10.00',
      minSpend: '0.00',
      validityMode: 'days_after_claim',
      validDays: 30,
      isUnlimitedSupply: false,
      totalCount: 5,
      remainingCount: 5,
      perUserLimit: 1,
      ...overrides,
    })
    .returning({ id: couponTemplates.id });
  return row!.id;
}

function templateRow(id: number) {
  return harness.ctx.db
    .select()
    .from(couponTemplates)
    .where(eq(couponTemplates.id, id))
    .then((rows) => rows[0]!);
}

/** A valid create/update form; the contract schema's superRefine has already been unit-tested. */
function form(overrides: Partial<CouponTemplateForm> = {}): CouponTemplateForm {
  return {
    name: '满减券',
    scope: 'all_products',
    claimMode: 'manual',
    status: 'active',
    discountAmount: '10.00',
    minSpend: '100.00',
    validityMode: 'days_after_claim',
    validFrom: null,
    validTo: null,
    validDays: 30,
    claimFrom: null,
    claimTo: null,
    isUnlimitedSupply: false,
    totalCount: 100,
    perUserLimit: 1,
    giftMinOrderAmount: null,
    sortOrder: 0,
    productIds: [],
    categoryIds: [],
    ...overrides,
  } as CouponTemplateForm;
}

async function expectDomainError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'DomainError', code });
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

describe('admin templates', () => {
  it('creates, reads back and lists', async () => {
    const created = await service.adminCreate(harness.ctx, form({ name: '新人礼' }));
    expect(created).toMatchObject({
      name: '新人礼',
      status: 'active',
      discountAmount: '10.00',
      minSpend: '100.00',
      totalCount: 100,
      remainingCount: 100,
      issuedCount: 0,
    });

    const detail = await service.adminDetail(harness.ctx, { id: created.id });
    expect(detail).toMatchObject({ id: created.id, name: '新人礼' });

    const list = await service.adminList(harness.ctx, {
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
    } as never);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ id: created.id, remainingCount: 100 });
  });

  it('keeps the product and category links', async () => {
    const [a, b] = [await makeProduct(), await makeProduct()];
    const created = await service.adminCreate(
      harness.ctx,
      form({ scope: 'products', productIds: [String(a), String(b)] }),
    );
    expect(created.productIds).toEqual([String(a), String(b)]);

    const reread = await service.adminDetail(harness.ctx, { id: created.id });
    expect([...reread.productIds].sort()).toEqual([String(a), String(b)].sort());

    // An edit replaces the set rather than adding to it.
    await service.adminUpdate(
      harness.ctx,
      { id: created.id },
      form({ scope: 'products', productIds: [String(b)] }),
    );
    expect((await service.adminDetail(harness.ctx, { id: created.id })).productIds).toEqual([
      String(b),
    ]);
  });

  it('applies the TOTAL DELTA to the remaining supply, instead of resetting it', async () => {
    // Resetting remain_count = total_count on every save would let renaming a
    // campaign that had 3 of 1000 left hand out 997 more coupons.
    const id = await makeTemplate({ totalCount: 1000, remainingCount: 3 });
    const detail = await service.adminUpdate(
      harness.ctx,
      { id: String(id) },
      form({ name: '改个名字', totalCount: 1000 }),
    );
    expect(detail.remainingCount).toBe(3);

    const raised = await service.adminUpdate(
      harness.ctx,
      { id: String(id) },
      form({ totalCount: 1100 }),
    );
    expect(raised.remainingCount).toBe(103);

    const lowered = await service.adminUpdate(
      harness.ctx,
      { id: String(id) },
      form({ totalCount: 1050 }),
    );
    expect(lowered.remainingCount).toBe(53);
  });

  it('floors the remaining supply at zero when the total is cut below what is gone', async () => {
    const id = await makeTemplate({ totalCount: 100, remainingCount: 1 });
    const detail = await service.adminUpdate(
      harness.ctx,
      { id: String(id) },
      form({ totalCount: 2 }),
    );
    expect(detail.remainingCount).toBe(0);
  });

  it('gives an unlimited template a fresh supply when it is made limited', async () => {
    const id = await makeTemplate({
      isUnlimitedSupply: true,
      totalCount: null,
      remainingCount: null,
    });
    const detail = await service.adminUpdate(
      harness.ctx,
      { id: String(id) },
      form({ isUnlimitedSupply: false, totalCount: 50 }),
    );
    expect(detail).toMatchObject({ totalCount: 50, remainingCount: 50 });
  });

  it('toggles the status', async () => {
    const id = await makeTemplate({ status: 'draft' });
    expect(
      (await service.adminSetStatus(harness.ctx, { id: String(id) }, { status: 'active' })).status,
    ).toBe('active');
    expect(
      (await service.adminSetStatus(harness.ctx, { id: String(id) }, { status: 'disabled' }))
        .status,
    ).toBe('disabled');
  });

  it('soft-deletes, leaving the coupons already in wallets alone', async () => {
    const id = await makeTemplate();
    const userId = await makeUser();
    await service.claim(asUser(userId), { id: String(id) });

    await service.adminDelete(harness.ctx, { id: String(id) });
    await expectDomainError(
      service.adminDetail(harness.ctx, { id: String(id) }),
      'COUPON_TEMPLATE_NOT_FOUND',
    );
    expect((await templateRow(id)).deletedAt).not.toBeNull();

    const wallet = await service.listMine(asUser(userId), {
      page: 1,
      pageSize: 20,
      state: 'unused',
    } as never);
    expect(wallet.total).toBe(1);
  });

  it('refuses a second delete', async () => {
    const id = await makeTemplate();
    await service.adminDelete(harness.ctx, { id: String(id) });
    await expectDomainError(
      service.adminDelete(harness.ctx, { id: String(id) }),
      'COUPON_TEMPLATE_NOT_FOUND',
    );
  });
});

describe('admin grants', () => {
  it('hands coupons to named users and reports what it did', async () => {
    const id = await makeTemplate({ claimMode: 'admin_grant', totalCount: 10, remainingCount: 10 });
    const [a, b] = [await makeUser(), await makeUser()];

    const result = await service.adminGrant(
      harness.ctx,
      { id: String(id) },
      { userIds: [String(a), String(b)] },
    );
    expect(result).toEqual({ granted: 2, skippedUserIds: [] });
    expect((await templateRow(id)).remainingCount).toBe(8);
  });

  it('skips a user who is already at the per-user limit rather than failing', async () => {
    const id = await makeTemplate({ claimMode: 'admin_grant', perUserLimit: 1 });
    const [a, b] = [await makeUser(), await makeUser()];
    await service.adminGrant(harness.ctx, { id: String(id) }, { userIds: [String(a)] });

    const second = await service.adminGrant(
      harness.ctx,
      { id: String(id) },
      { userIds: [String(a), String(b)] },
    );
    expect(second).toEqual({ granted: 1, skippedUserIds: [String(a)] });
  });

  it('refuses the whole grant when a user id does not exist', async () => {
    const id = await makeTemplate({ claimMode: 'admin_grant' });
    const a = await makeUser();
    await expectDomainError(
      service.adminGrant(harness.ctx, { id: String(id) }, { userIds: [String(a), '999999'] }),
      'COUPON_GRANT_USER_UNKNOWN',
    );
    // All or nothing: the valid user got nothing either.
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(0);
  });

  it('is all-or-nothing when the supply runs out part way through', async () => {
    const id = await makeTemplate({ claimMode: 'admin_grant', totalCount: 2, remainingCount: 2 });
    const userIds = [await makeUser(), await makeUser(), await makeUser()];
    await expectDomainError(
      service.adminGrant(harness.ctx, { id: String(id) }, { userIds: userIds.map(String) }),
      'COUPON_SOLD_OUT',
    );
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(0);
    expect((await templateRow(id)).remainingCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// claiming
// ---------------------------------------------------------------------------

describe('claim', () => {
  it('puts a coupon in the wallet and decrements the supply — COUPON-003', async () => {
    const id = await makeTemplate({ discountAmount: '15.00', minSpend: '99.00' });
    const userId = await makeUser();

    const result = await service.claim(asUser(userId), { id: String(id) });
    expect(result.remainingCount).toBe(4);
    expect(result.coupon).toMatchObject({
      templateId: String(id),
      status: 'unused',
      discountAmount: '15.00',
      minSpend: '99.00',
      sourceKind: 'claim',
    });
    // The window is computed from the claim instant for days_after_claim.
    expect(result.coupon.validFrom).toBe('2026-06-01T00:00:00.000Z');
    expect(result.coupon.validTo).toBe('2026-07-01T00:00:00.000Z');
    expect((await templateRow(id)).remainingCount).toBe(4);
  });

  it('snapshots the amounts, so re-pricing the campaign never changes a coupon already held', async () => {
    const id = await makeTemplate({ discountAmount: '10.00' });
    const userId = await makeUser();
    const claimed = await service.claim(asUser(userId), { id: String(id) });

    await service.adminUpdate(harness.ctx, { id: String(id) }, form({ discountAmount: '1.00' }));
    const wallet = await service.listMine(asUser(userId), {
      page: 1,
      pageSize: 20,
      state: 'unused',
    } as never);
    expect(wallet.items[0]?.discountAmount).toBe('10.00');
    expect(wallet.items[0]?.id).toBe(claimed.coupon.id);
  });

  it('leaves an unlimited template alone and reports a null remainder', async () => {
    const id = await makeTemplate({
      isUnlimitedSupply: true,
      totalCount: null,
      remainingCount: null,
    });
    const userId = await makeUser();
    expect((await service.claim(asUser(userId), { id: String(id) })).remainingCount).toBeNull();
  });

  it('refuses an anonymous caller', async () => {
    const id = await makeTemplate();
    await expectDomainError(service.claim(harness.ctx, { id: String(id) }), 'UNAUTHENTICATED');
  });

  it('refuses a draft, disabled, deleted or unknown template the same way', async () => {
    const userId = await makeUser();
    const draft = await makeTemplate({ status: 'draft' });
    const disabled = await makeTemplate({ status: 'disabled' });
    const deleted = await makeTemplate();
    await service.adminDelete(harness.ctx, { id: String(deleted) });

    for (const id of [draft, disabled, deleted, 999999]) {
      await expectDomainError(
        service.claim(asUser(userId), { id: String(id) }),
        'COUPON_TEMPLATE_NOT_FOUND',
      );
    }
  });

  it('refuses a template that is issued rather than claimed', async () => {
    const userId = await makeUser();
    for (const claimMode of ['new_user', 'order_gift', 'admin_grant'] as const) {
      const id = await makeTemplate({ claimMode });
      await expectDomainError(
        service.claim(asUser(userId), { id: String(id) }),
        'COUPON_NOT_CLAIMABLE',
      );
    }
  });

  it('refuses outside the claim window', async () => {
    const userId = await makeUser();
    const early = await makeTemplate({ claimFrom: new Date('2026-07-01T00:00:00Z') });
    const late = await makeTemplate({ claimTo: new Date('2026-05-01T00:00:00Z') });
    for (const id of [early, late]) {
      await expectDomainError(
        service.claim(asUser(userId), { id: String(id) }),
        'COUPON_CLAIM_WINDOW_CLOSED',
      );
    }
  });

  it('refuses a fixed_window campaign that has already expired', async () => {
    const userId = await makeUser();
    const id = await makeTemplate({
      validityMode: 'fixed_window',
      validDays: null,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: new Date('2026-02-01T00:00:00Z'),
    });
    await expectDomainError(
      service.claim(asUser(userId), { id: String(id) }),
      'COUPON_CLAIM_WINDOW_CLOSED',
    );
  });

  it('refuses the second claim by the same user — per_user_limit', async () => {
    const id = await makeTemplate({ perUserLimit: 1 });
    const userId = await makeUser();
    await service.claim(asUser(userId), { id: String(id) });
    await expectDomainError(
      service.claim(asUser(userId), { id: String(id) }),
      'COUPON_PER_USER_LIMIT_REACHED',
    );
    // The refusal cost nothing from the supply.
    expect((await templateRow(id)).remainingCount).toBe(4);
  });

  it('allows exactly per_user_limit claims, no more', async () => {
    const id = await makeTemplate({ perUserLimit: 3, totalCount: 10, remainingCount: 10 });
    const userId = await makeUser();
    for (let i = 0; i < 3; i += 1) await service.claim(asUser(userId), { id: String(id) });
    await expectDomainError(
      service.claim(asUser(userId), { id: String(id) }),
      'COUPON_PER_USER_LIMIT_REACHED',
    );
    expect((await templateRow(id)).remainingCount).toBe(7);
  });

  it('lets one user claim without limit when per_user_limit is null', async () => {
    const id = await makeTemplate({ perUserLimit: null });
    const userId = await makeUser();
    for (let i = 0; i < 5; i += 1) await service.claim(asUser(userId), { id: String(id) });
    expect((await templateRow(id)).remainingCount).toBe(0);
    await expectDomainError(service.claim(asUser(userId), { id: String(id) }), 'COUPON_SOLD_OUT');
  });

  it('refuses when the supply is gone, and never goes negative', async () => {
    const id = await makeTemplate({ totalCount: 1, remainingCount: 1, perUserLimit: null });
    const userId = await makeUser();
    await service.claim(asUser(userId), { id: String(id) });
    await expectDomainError(service.claim(asUser(userId), { id: String(id) }), 'COUPON_SOLD_OUT');
    expect((await templateRow(id)).remainingCount).toBe(0);
    // The refused claim left no wallet row behind.
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// storefront reads
// ---------------------------------------------------------------------------

describe('listClaimable', () => {
  it('lists only live, in-stock, manually claimable templates', async () => {
    const claimable = await makeTemplate({ name: '可领' });
    await makeTemplate({ name: '草稿', status: 'draft' });
    await makeTemplate({ name: '已领完', totalCount: 1, remainingCount: 0 });
    await makeTemplate({ name: '新人专享', claimMode: 'new_user' });
    await makeTemplate({ name: '已过期', claimTo: new Date('2026-01-01T00:00:00Z') });

    const list = await service.listClaimable(harness.ctx, { page: 1, pageSize: 20 } as never);
    expect(list.items.map((item) => item.name)).toEqual(['可领']);
    expect(list.items[0]?.templateId).toBe(String(claimable));
  });

  it('reports the caller state as null for an anonymous visitor, and fills it in when signed in', async () => {
    const id = await makeTemplate({ perUserLimit: 1 });
    const anonymous = await service.listClaimable(harness.ctx, { page: 1, pageSize: 20 } as never);
    expect(anonymous.items[0]).toMatchObject({ claimedCount: null, canClaim: null });

    const userId = await makeUser();
    const before = await service.listClaimable(asUser(userId), { page: 1, pageSize: 20 } as never);
    expect(before.items[0]).toMatchObject({ claimedCount: 0, canClaim: true });

    await service.claim(asUser(userId), { id: String(id) });
    const after = await service.listClaimable(asUser(userId), { page: 1, pageSize: 20 } as never);
    expect(after.items[0]).toMatchObject({ claimedCount: 1, canClaim: false });
  });

  it('advertises new-user coupons but never marks them claimable', async () => {
    await makeTemplate({ name: '新人礼', claimMode: 'new_user' });
    const userId = await makeUser();
    const list = await service.listNewUser(asUser(userId));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ name: '新人礼', canClaim: false });
  });
});

describe('listMine', () => {
  it('splits the wallet into unused, used and expired', async () => {
    const userId = await makeUser();
    const unusedId = await makeTemplate({ perUserLimit: null, validDays: 30 });
    const shortId = await makeTemplate({ perUserLimit: null, validDays: 1 });

    const keep = await service.claim(asUser(userId), { id: String(unusedId) });
    const spend = await service.claim(asUser(userId), { id: String(unusedId) });
    const lapse = await service.claim(asUser(userId), { id: String(shortId) });

    await withTx(harness.ctx.db, (tx) =>
      service.redeem(tx, harness.ctx, {
        userCouponId: Number(spend.coupon.id),
        userId,
        orderId: 1,
      }),
    );
    harness.clock.advance(2 * 24 * 60 * 60 * 1000);

    const page = { page: 1, pageSize: 20 };
    const unused = await service.listMine(asUser(userId), { ...page, state: 'unused' } as never);
    const used = await service.listMine(asUser(userId), { ...page, state: 'used' } as never);
    const expired = await service.listMine(asUser(userId), { ...page, state: 'expired' } as never);

    expect(unused.items.map((c) => c.id)).toEqual([keep.coupon.id]);
    expect(used.items.map((c) => c.id)).toEqual([spend.coupon.id]);
    // Expired by its window, without the sweep having run.
    expect(expired.items.map((c) => c.id)).toEqual([lapse.coupon.id]);
  });

  it("never shows another user's coupons", async () => {
    const id = await makeTemplate();
    const [mine, theirs] = [await makeUser(), await makeUser()];
    await service.claim(asUser(theirs), { id: String(id) });
    const list = await service.listMine(asUser(mine), {
      page: 1,
      pageSize: 20,
      state: 'unused',
    } as never);
    expect(list.total).toBe(0);
  });
});

describe('staffListUserCoupons — 查看优惠券', () => {
  const staffActor = (id: number): Actor => ({
    kind: 'staff',
    id,
    permissions: [],
    isSuper: false,
  });

  /** One customer holding one spendable, one spent and one lapsed coupon. */
  async function walletWithThreeStates(userId: number) {
    const longId = await makeTemplate({ perUserLimit: null, validDays: 30 });
    const shortId = await makeTemplate({ perUserLimit: null, validDays: 1 });
    // Claimed in this order, so ids ascend: spent, lapsed, kept.
    const spent = await service.claim(asUser(userId), { id: String(longId) });
    const lapsed = await service.claim(asUser(userId), { id: String(shortId) });
    const kept = await service.claim(asUser(userId), { id: String(longId) });
    await withTx(harness.ctx.db, (tx) =>
      service.redeem(tx, harness.ctx, {
        userCouponId: Number(spent.coupon.id),
        userId,
        orderId: 1,
      }),
    );
    harness.clock.advance(2 * 24 * 60 * 60 * 1000);
    return { spent: spent.coupon.id, lapsed: lapsed.coupon.id, kept: kept.coupon.id };
  }

  it('answers every coupon the customer holds, the spendable ones first', async () => {
    const staffId = await makeUser();
    const customer = await makeUser();
    const { spent, lapsed, kept } = await walletWithThreeStates(customer);

    const all = await service.staffListUserCoupons(
      harness.as(staffActor(staffId)),
      { uid: String(customer) },
      {},
    );
    // Spendable first; the rest newest first.
    expect(all.items.map((c) => c.id)).toEqual([kept, lapsed, spent]);
    // The storefront wallet item, not a fork of it.
    const mine = await service.listMine(asUser(customer), {
      page: 1,
      pageSize: 20,
      state: 'unused',
    } as never);
    expect(all.items[0]).toEqual(mine.items[0]);
  });

  it('narrows to one wallet tab with ?state, exactly as the wallet splits them', async () => {
    const staffId = await makeUser();
    const customer = await makeUser();
    const { spent, lapsed, kept } = await walletWithThreeStates(customer);
    const staffCtx = harness.as(staffActor(staffId));
    const uid = String(customer);

    const ids = async (state: 'unused' | 'used' | 'expired') =>
      (await service.staffListUserCoupons(staffCtx, { uid }, { state })).items.map((c) => c.id);
    expect(await ids('unused')).toEqual([kept]);
    expect(await ids('used')).toEqual([spent]);
    // Lapsed by its window, without the sweep having run.
    expect(await ids('expired')).toEqual([lapsed]);
  });

  it("never leaks another customer's coupons, and says so for an unknown one", async () => {
    const staffId = await makeUser();
    const [customer, other] = [await makeUser(), await makeUser()];
    const id = await makeTemplate({ perUserLimit: null });
    await service.claim(asUser(other), { id: String(id) });
    await service.claim(asUser(other), { id: String(id) });
    // The 店员 holds one too; it must not show up under the customer either.
    await service.claim(asUser(staffId), { id: String(id) });
    const staffCtx = harness.as(staffActor(staffId));

    const list = await service.staffListUserCoupons(staffCtx, { uid: String(customer) }, {});
    expect(list.items).toEqual([]);

    await expectDomainError(
      service.staffListUserCoupons(staffCtx, { uid: '999999' }, {}),
      'USER_NOT_FOUND',
    );
  });

  it('refuses anyone who is not staff with FORBIDDEN (403), even the customer', async () => {
    const customer = await makeUser();
    const id = await makeTemplate();
    await service.claim(asUser(customer), { id: String(id) });
    const uid = String(customer);

    for (const ctx of [asUser(customer), asUser(await makeUser()), harness.ctx]) {
      await expectDomainError(service.staffListUserCoupons(ctx, { uid }, {}), 'FORBIDDEN');
    }
    const error = await service
      .staffListUserCoupons(asUser(customer), { uid }, {})
      .catch((cause: unknown) => cause);
    expect((error as DomainError).status).toBe(403);
  });
});

describe('listApplicable', () => {
  it('quotes every spendable coupon against the cart, best offer first', async () => {
    const userId = await makeUser();
    const productId = await makeProduct();
    const small = await makeTemplate({ discountAmount: '5.00', minSpend: '0.00' });
    const big = await makeTemplate({ discountAmount: '30.00', minSpend: '0.00' });
    const unreachable = await makeTemplate({ discountAmount: '50.00', minSpend: '500.00' });
    for (const id of [small, big, unreachable]) {
      await service.claim(asUser(userId), { id: String(id) });
    }

    const result = await service.listApplicable(asUser(userId), {
      lines: [{ productId: String(productId), categoryIds: [], amount: '100.00' }],
    });
    expect(result.subtotal).toBe('100.00');
    expect(result.items.map((item) => [item.usable, item.discount, item.reason])).toEqual([
      [true, '30.00', null],
      [true, '5.00', null],
      [false, '0.00', 'COUPON_MIN_SPEND_NOT_MET'],
    ]);
  });

  it('leaves used and expired coupons out of the picker entirely', async () => {
    const userId = await makeUser();
    const productId = await makeProduct();
    const id = await makeTemplate({ perUserLimit: null, validDays: 1 });
    const spend = await service.claim(asUser(userId), { id: String(id) });
    await service.claim(asUser(userId), { id: String(id) });

    await withTx(harness.ctx.db, (tx) =>
      service.redeem(tx, harness.ctx, {
        userCouponId: Number(spend.coupon.id),
        userId,
        orderId: 1,
      }),
    );
    harness.clock.advance(2 * 24 * 60 * 60 * 1000);

    const result = await service.listApplicable(asUser(userId), {
      lines: [{ productId: String(productId), categoryIds: [], amount: '100.00' }],
    });
    expect(result.items).toHaveLength(0);
  });

  describe('a 品类券 is matched against the product, not the body', () => {
    /** A ¥15-off 品类券 on `categoryId`, claimed by `userId`. */
    async function categoryCoupon(userId: number, categoryId: number): Promise<string> {
      const template = await service.adminCreate(
        harness.ctx,
        form({
          scope: 'categories',
          categoryIds: [String(categoryId)],
          discountAmount: '15.00',
          minSpend: '0.00',
        }),
      );
      const claimed = await service.claim(asUser(userId), { id: template.id });
      return claimed.coupon.id;
    }

    it('is usable for a cart in its category when the body sends no categories', async () => {
      const userId = await makeUser();
      const [inCategory, elsewhere] = [await makeProduct(), await makeProduct()];
      const category = await makeCategory([inCategory]);
      const couponId = await categoryCoupon(userId, category);

      const result = await service.listApplicable(asUser(userId), {
        lines: [
          { productId: String(elsewhere), amount: '40.00' },
          { productId: String(inCategory), amount: '100.00' },
        ],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        coupon: { id: couponId },
        usable: true,
        discount: '15.00',
        eligibleLineIndexes: [1],
        reason: null,
      });
    });

    it('is not usable when the client claims a category the product is not in', async () => {
      const userId = await makeUser();
      const [inCategory, elsewhere] = [await makeProduct(), await makeProduct()];
      const category = await makeCategory([inCategory]);
      await categoryCoupon(userId, category);

      const result = await service.listApplicable(asUser(userId), {
        lines: [
          { productId: String(elsewhere), categoryIds: [String(category)], amount: '100.00' },
        ],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        usable: false,
        discount: '0.00',
        eligibleLineIndexes: [],
        reason: 'COUPON_NOT_APPLICABLE',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// the domain API other domains call
// ---------------------------------------------------------------------------

describe('quote', () => {
  it('uses the live template scope with the wallet row amounts', async () => {
    const userId = await makeUser();
    const [inScope, outOfScope] = [await makeProduct(), await makeProduct()];
    const templateId = Number(
      (
        await service.adminCreate(
          harness.ctx,
          form({
            scope: 'products',
            productIds: [String(inScope)],
            discountAmount: '20.00',
            minSpend: '0.00',
          }),
        )
      ).id,
    );
    const claimed = await service.claim(asUser(userId), { id: String(templateId) });
    const userCouponId = Number(claimed.coupon.id);

    const quoted = await service.quote(harness.ctx, {
      userCouponId,
      userId,
      lines: [
        { productId: inScope, categoryIds: [], amount: Money.parse('50.00') },
        { productId: outOfScope, categoryIds: [], amount: Money.parse('900.00') },
      ],
    });
    expect(quoted.discount.toString()).toBe('20.00');
    expect(quoted.eligibleLineIndexes).toEqual([0]);
    expect(quoted.eligibleSubtotal.toString()).toBe('50.00');

    await expectDomainError(
      service.quote(harness.ctx, {
        userCouponId,
        userId,
        lines: [{ productId: outOfScope, categoryIds: [], amount: Money.parse('900.00') }],
      }),
      'COUPON_NOT_APPLICABLE',
    );
  });

  it('carries the threshold in the details when the cart is too small', async () => {
    const userId = await makeUser();
    const productId = await makeProduct();
    const id = await makeTemplate({ minSpend: '100.00' });
    const claimed = await service.claim(asUser(userId), { id: String(id) });

    const error = await service
      .quote(harness.ctx, {
        userCouponId: Number(claimed.coupon.id),
        userId,
        lines: [{ productId, categoryIds: [], amount: Money.parse('99.99') }],
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: 'COUPON_MIN_SPEND_NOT_MET',
      details: { minSpend: '100.00' },
    });
  });

  it("refuses somebody else's coupon with NOT_FOUND, not FORBIDDEN", async () => {
    const [owner, stranger] = [await makeUser(), await makeUser()];
    const productId = await makeProduct();
    const id = await makeTemplate();
    const claimed = await service.claim(asUser(owner), { id: String(id) });

    await expectDomainError(
      service.quote(harness.ctx, {
        userCouponId: Number(claimed.coupon.id),
        userId: stranger,
        lines: [{ productId, categoryIds: [], amount: Money.parse('100.00') }],
      }),
      'COUPON_NOT_FOUND',
    );
  });

  it('writes nothing, so it can be called twice while pricing', async () => {
    const userId = await makeUser();
    const productId = await makeProduct();
    const id = await makeTemplate();
    const claimed = await service.claim(asUser(userId), { id: String(id) });
    const input = {
      userCouponId: Number(claimed.coupon.id),
      userId,
      lines: [{ productId, categoryIds: [], amount: Money.parse('100.00') }],
    };
    await service.quote(harness.ctx, input);
    await service.quote(harness.ctx, input);
    const [row] = await harness.ctx.db
      .select()
      .from(userCoupons)
      .where(eq(userCoupons.id, input.userCouponId));
    expect(row?.status).toBe('unused');
  });
});

describe('redeem', () => {
  async function claimed() {
    const userId = await makeUser();
    const id = await makeTemplate({ perUserLimit: null });
    const result = await service.claim(asUser(userId), { id: String(id) });
    return { userId, templateId: id, userCouponId: Number(result.coupon.id) };
  }

  const redeem = (userCouponId: number, userId: number) =>
    withTx(harness.ctx.db, (tx) =>
      service.redeem(tx, harness.ctx, { userCouponId, userId, orderId: 7 }),
    );

  it('marks the coupon used, with the used_at the CHECK insists on', async () => {
    const { userCouponId, userId } = await claimed();
    await redeem(userCouponId, userId);
    const [row] = await harness.ctx.db
      .select()
      .from(userCoupons)
      .where(eq(userCoupons.id, userCouponId));
    expect(row?.status).toBe('used');
    expect(row?.usedAt?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('refuses a second redemption — COUPON-004', async () => {
    const { userCouponId, userId } = await claimed();
    await redeem(userCouponId, userId);
    await expectDomainError(redeem(userCouponId, userId), 'COUPON_NOT_USABLE');
  });

  it('refuses every unusable shape with one code — COUPON-005', async () => {
    // Somebody else's.
    const other = await makeUser();
    const mine = await claimed();
    await expectDomainError(redeem(mine.userCouponId, other), 'COUPON_NOT_USABLE');

    // Missing.
    await expectDomainError(redeem(999999, mine.userId), 'COUPON_NOT_USABLE');

    // Expired by its window.
    const lapsing = await claimed();
    harness.clock.advance(31 * 24 * 60 * 60 * 1000);
    await expectDomainError(redeem(lapsing.userCouponId, lapsing.userId), 'COUPON_NOT_USABLE');
    harness.clock.set('2026-06-01T00:00:00.000Z');

    // Swept to `expired`.
    const swept = await claimed();
    await harness.ctx.db
      .update(userCoupons)
      .set({ status: 'expired' })
      .where(eq(userCoupons.id, swept.userCouponId));
    await expectDomainError(redeem(swept.userCouponId, swept.userId), 'COUPON_NOT_USABLE');

    // Revoked.
    const revoked = await claimed();
    await harness.ctx.db
      .update(userCoupons)
      .set({ status: 'revoked' })
      .where(eq(userCoupons.id, revoked.userCouponId));
    await expectDomainError(redeem(revoked.userCouponId, revoked.userId), 'COUPON_NOT_USABLE');

    // Not valid yet.
    const future = await claimed();
    await harness.ctx.db
      .update(userCoupons)
      .set({
        validFrom: new Date('2026-07-01T00:00:00Z'),
        validTo: new Date('2026-08-01T00:00:00Z'),
      })
      .where(eq(userCoupons.id, future.userCouponId));
    await expectDomainError(redeem(future.userCouponId, future.userId), 'COUPON_NOT_USABLE');
  });

  it('takes the whole order transaction down with it', async () => {
    const { userCouponId, userId } = await claimed();
    await redeem(userCouponId, userId);

    // The caller's transaction does other work; the failed redemption must
    // undo it rather than leave a half-priced order behind.
    await expect(
      withTx(harness.ctx.db, async (tx) => {
        await tx.insert(users).values({ account: 'order-side-effect' });
        await service.redeem(tx, harness.ctx, { userCouponId, userId, orderId: 8 });
      }),
    ).rejects.toMatchObject({ code: 'COUPON_NOT_USABLE' });

    const leftover = await harness.ctx.db
      .select()
      .from(users)
      .where(eq(users.account, 'order-side-effect'));
    expect(leftover).toHaveLength(0);
  });
});

describe('release', () => {
  async function used(validDays = 30) {
    const userId = await makeUser();
    const id = await makeTemplate({ perUserLimit: null, validDays });
    const claimedCoupon = await service.claim(asUser(userId), { id: String(id) });
    const userCouponId = Number(claimedCoupon.coupon.id);
    await withTx(harness.ctx.db, (tx) =>
      service.redeem(tx, harness.ctx, { userCouponId, userId, orderId: 9 }),
    );
    return { userId, userCouponId };
  }

  const release = (userCouponId: number) =>
    withTx(harness.ctx.db, (tx) => service.release(tx, harness.ctx, { userCouponId, orderId: 9 }));

  it('gives a still-valid coupon back as unused', async () => {
    const { userCouponId } = await used();
    expect(await release(userCouponId)).toEqual({ released: true });
    const [row] = await harness.ctx.db
      .select()
      .from(userCoupons)
      .where(eq(userCoupons.id, userCouponId));
    expect(row).toMatchObject({ status: 'unused', usedAt: null });
  });

  it('gives a lapsed coupon back as EXPIRED, not unused', async () => {
    // Handing it back as 未使用 would give the shopper something they could not
    // have spent anyway.
    const { userCouponId } = await used(1);
    harness.clock.advance(2 * 24 * 60 * 60 * 1000);
    expect(await release(userCouponId)).toEqual({ released: true });
    const [row] = await harness.ctx.db
      .select()
      .from(userCoupons)
      .where(eq(userCoupons.id, userCouponId));
    expect(row?.status).toBe('expired');
  });

  it('is a no-op the second time, because the ledger retries', async () => {
    const { userCouponId } = await used();
    expect(await release(userCouponId)).toEqual({ released: true });
    expect(await release(userCouponId)).toEqual({ released: false });
  });

  it('reports false for a coupon that was never spent', async () => {
    const userId = await makeUser();
    const id = await makeTemplate();
    const claimedCoupon = await service.claim(asUser(userId), { id: String(id) });
    expect(await release(Number(claimedCoupon.coupon.id))).toEqual({ released: false });
  });
});

describe('grantNewUser', () => {
  const grant = (userId: number) =>
    withTx(harness.ctx.db, (tx) => service.grantNewUser(tx, harness.ctx, userId));

  it('issues every active new-user template', async () => {
    await makeTemplate({ claimMode: 'new_user' });
    await makeTemplate({ claimMode: 'new_user' });
    await makeTemplate({ claimMode: 'new_user', status: 'draft' });
    await makeTemplate({ claimMode: 'manual' });

    const userId = await makeUser();
    expect(await grant(userId)).toBe(2);
  });

  it('issues nothing the second time — a retried registration — USER-002', async () => {
    await makeTemplate({ claimMode: 'new_user' });
    const userId = await makeUser();
    expect(await grant(userId)).toBe(1);
    expect(await grant(userId)).toBe(0);
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(1);
  });

  it('never fails a registration over a sold-out welcome coupon', async () => {
    const id = await makeTemplate({
      claimMode: 'new_user',
      totalCount: 1,
      remainingCount: 0,
      perUserLimit: null,
    });
    const userId = await makeUser();
    expect(await grant(userId)).toBe(0);
    // And it left no half-issued row behind.
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(0);
    expect((await templateRow(id)).remainingCount).toBe(0);
  });
});

describe('grantOrderGifts', () => {
  const grant = (input: service.OrderGiftInput) =>
    withTx(harness.ctx.db, (tx) => service.grantOrderGifts(tx, harness.ctx, input));

  it('issues the coupons attached to the products bought', async () => {
    const productId = await makeProduct();
    const otherProductId = await makeProduct();
    // `admin_grant` so the template is not also picked up as an order-value gift.
    const attached = await makeTemplate({ claimMode: 'admin_grant' });
    await harness.ctx.db.insert(productGiftCoupons).values({ productId, templateId: attached });

    const userId = await makeUser();
    const result = await grant({
      userId,
      orderId: await makeOrder(userId),
      productIds: [otherProductId],
      paidAmount: Money.parse('1.00'),
    });
    expect(result.granted).toBe(0);

    expect(
      (
        await grant({
          userId,
          orderId: await makeOrder(userId),
          productIds: [productId],
          paidAmount: Money.parse('1.00'),
        })
      ).granted,
    ).toBe(1);
  });

  it('issues order-value gifts only above the threshold', async () => {
    await makeTemplate({ claimMode: 'order_gift', giftMinOrderAmount: '200.00' });
    const userId = await makeUser();

    const below = await makeOrder(userId);
    const above = await makeOrder(userId);
    expect(
      (await grant({ userId, orderId: below, productIds: [], paidAmount: Money.parse('199.99') }))
        .granted,
    ).toBe(0);
    expect(
      (await grant({ userId, orderId: above, productIds: [], paidAmount: Money.parse('200.00') }))
        .granted,
    ).toBe(1);
  });

  it('issues nothing extra when the payment callback is replayed', async () => {
    // Without a guard, a repeated WeChat callback would grant the gift coupons
    // again.
    await makeTemplate({ claimMode: 'order_gift', perUserLimit: null });
    const userId = await makeUser();
    const input = {
      userId,
      orderId: await makeOrder(userId),
      productIds: [],
      paidAmount: Money.parse('500.00'),
    };
    expect((await grant(input)).granted).toBe(1);
    expect((await grant(input)).granted).toBe(0);
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(1);
  });

  it('still issues the gift for a different order', async () => {
    await makeTemplate({ claimMode: 'order_gift', perUserLimit: null });
    const userId = await makeUser();
    const base = { userId, productIds: [], paidAmount: Money.parse('500.00') };
    expect((await grant({ ...base, orderId: await makeOrder(userId) })).granted).toBe(1);
    expect((await grant({ ...base, orderId: await makeOrder(userId) })).granted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// the sweeps
// ---------------------------------------------------------------------------

describe('jobs', () => {
  it('expires overdue coupons and leaves everything else alone', async () => {
    const userId = await makeUser();
    const shortId = await makeTemplate({ perUserLimit: null, validDays: 1 });
    const longId = await makeTemplate({ perUserLimit: null, validDays: 90 });
    const lapsing = await service.claim(asUser(userId), { id: String(shortId) });
    const spent = await service.claim(asUser(userId), { id: String(shortId) });
    const surviving = await service.claim(asUser(userId), { id: String(longId) });
    await withTx(harness.ctx.db, (tx) =>
      service.redeem(tx, harness.ctx, {
        userCouponId: Number(spent.coupon.id),
        userId,
        orderId: 1,
      }),
    );

    expect(await expireOverdueCoupons(harness.ctx)).toBe(0);
    harness.clock.advance(2 * 24 * 60 * 60 * 1000);
    expect(await expireOverdueCoupons(harness.ctx)).toBe(1);
    // Idempotent: nothing left to do on the second run.
    expect(await expireOverdueCoupons(harness.ctx)).toBe(0);

    const statusOf = async (id: string) =>
      (
        await harness.ctx.db
          .select()
          .from(userCoupons)
          .where(eq(userCoupons.id, Number(id)))
      )[0]?.status;
    expect(await statusOf(lapsing.coupon.id)).toBe('expired');
    expect(await statusOf(spent.coupon.id)).toBe('used');
    expect(await statusOf(surviving.coupon.id)).toBe('unused');
  });

  it('disables campaigns whose claim window has closed', async () => {
    const closing = await makeTemplate({ claimTo: new Date('2026-06-02T00:00:00Z') });
    const open = await makeTemplate({ claimTo: new Date('2026-12-31T00:00:00Z') });

    expect(await disableClosedCampaigns(harness.ctx)).toBe(0);
    harness.clock.advance(3 * 24 * 60 * 60 * 1000);
    expect(await disableClosedCampaigns(harness.ctx)).toBe(1);
    expect(await disableClosedCampaigns(harness.ctx)).toBe(0);

    expect((await templateRow(closing)).status).toBe('disabled');
    expect((await templateRow(open)).status).toBe('active');
  });
});

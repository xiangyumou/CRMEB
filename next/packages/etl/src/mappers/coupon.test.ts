import { describe, expect, it } from 'vitest';
import { mapCoupons, type LegacyCouponIssue, type LegacyCouponUser } from './coupon';

/**
 * The mapper against literal legacy rows.
 *
 * The four `issue` rows below are copied verbatim out of
 * `crmeb/public/install/crmeb.sql` (the `INSERT INTO eb_store_coupon_issue`
 * at line 27692), so this test fails the day somebody guesses at a legacy
 * column instead of reading one. A migration test with invented input proves
 * nothing.
 */

const seedIssues: LegacyCouponIssue[] = [
  // (1, 0, '新人专享', …, receive_type 2)
  issue({
    id: 1,
    title: '新人专享',
    coupon_price: '10.00',
    use_min_price: '20.00',
    coupon_time: 90,
    receive_type: 2,
    is_permanent: 1,
    receive_limit: 1,
  }),
  // (2, 0, '会员专享', …, receive_type 4) — the retired kind.
  issue({
    id: 2,
    title: '会员专享',
    coupon_price: '9.90',
    use_min_price: '0.00',
    coupon_time: 30,
    receive_type: 4,
    is_permanent: 1,
    receive_limit: 1,
  }),
  // (3, 0, '通用券', …, receive_type 1)
  issue({
    id: 3,
    title: '通用券',
    coupon_price: '7.00',
    use_min_price: '100.00',
    coupon_time: 30,
    receive_type: 1,
    is_permanent: 1,
    receive_limit: 1,
  }),
  // (4, 0, '商品券', …, type 1 品类券)
  issue({
    id: 4,
    title: '商品券',
    coupon_price: '100.00',
    use_min_price: '500.00',
    coupon_time: 30,
    receive_type: 1,
    type: 1,
    is_permanent: 1,
    receive_limit: 1,
  }),
];

function issue(overrides: Partial<LegacyCouponIssue> & { id: number }): LegacyCouponIssue {
  return {
    title: '券',
    coupon_price: '10.00',
    use_min_price: '0.00',
    coupon_time: 30,
    start_use_time: 0,
    end_use_time: 0,
    start_time: 0,
    end_time: 0,
    total_count: 0,
    remain_count: 0,
    receive_limit: 0,
    is_permanent: 0,
    status: 1,
    type: 0,
    receive_type: 1,
    is_full_give: 0,
    full_reduction: '0.00',
    is_del: 0,
    add_time: 1676279814,
    sort: 0,
    ...overrides,
  };
}

function userCoupon(overrides: Partial<LegacyCouponUser> & { id: number }): LegacyCouponUser {
  return {
    cid: 3,
    uid: 100,
    coupon_title: '通用券',
    coupon_price: '7.00',
    use_min_price: '100.00',
    add_time: 1676279814,
    start_time: 1676279814,
    end_time: 1678871814,
    use_time: 0,
    type: 'get',
    status: 0,
    is_fail: 0,
    ...overrides,
  };
}

describe('templates', () => {
  it('migrates the seed data and drops the member coupon — COUPON-001 / COUPON-002', () => {
    const result = mapCoupons({ issues: seedIssues });

    expect(result.report.templates).toBe(3);
    expect(result.report.templatesDroppedMemberCoupon).toBe(1);
    expect(result.report.droppedTemplateIds).toEqual([2]);
    // The dropped one is the member coupon, and nothing else.
    expect(result.templates.map((t) => t.name)).toEqual(['新人专享', '通用券', '商品券']);
  });

  it('keeps the legacy ids, so support tickets quoting one still work', () => {
    const result = mapCoupons({ issues: seedIssues });
    expect(result.templates.map((t) => t.id)).toEqual([1, 3, 4]);
  });

  it('maps receive_type to the claim mode', () => {
    const result = mapCoupons({
      issues: [
        issue({ id: 10, receive_type: 1 }),
        issue({ id: 11, receive_type: 2 }),
        issue({ id: 12, receive_type: 3 }),
        // `is_full_give` is the other way a legacy coupon was an order gift.
        issue({ id: 13, receive_type: 1, is_full_give: 1, full_reduction: '199.00' }),
      ],
    });
    expect(result.templates.map((t) => t.claimMode)).toEqual([
      'manual',
      'new_user',
      'order_gift',
      'order_gift',
    ]);
    expect(result.templates[3]?.giftMinOrderAmount).toBe('199.00');
    // A threshold of 0 means "every paid order", which is NULL now.
    expect(result.templates[2]?.giftMinOrderAmount).toBeNull();
  });

  it('maps type to the scope', () => {
    const result = mapCoupons({
      issues: [issue({ id: 20, type: 0 }), issue({ id: 21, type: 1 }), issue({ id: 22, type: 2 })],
    });
    expect(result.templates.map((t) => t.scope)).toEqual([
      'all_products',
      'categories',
      'products',
    ]);
  });

  it('maps the three legacy statuses', () => {
    const result = mapCoupons({
      issues: [
        issue({ id: 30, status: 1 }),
        issue({ id: 31, status: 0 }),
        issue({ id: 32, status: -1 }),
      ],
    });
    expect(result.templates.map((t) => t.status)).toEqual(['active', 'draft', 'disabled']);
  });

  it('drops soft-deleted campaigns and counts them separately', () => {
    const result = mapCoupons({ issues: [issue({ id: 40, is_del: 1 }), issue({ id: 41 })] });
    expect(result.report.templatesDroppedDeleted).toBe(1);
    expect(result.report.templatesDroppedMemberCoupon).toBe(0);
    expect(result.templates.map((t) => t.id)).toEqual([41]);
  });

  it('chooses the validity mode from which legacy fields are set', () => {
    const result = mapCoupons({
      issues: [
        issue({ id: 50, coupon_time: 45 }),
        issue({ id: 51, start_use_time: 1700000000, end_use_time: 1710000000, coupon_time: 45 }),
        // Neither set: 30 days rather than a row the CHECK would refuse.
        issue({ id: 52, coupon_time: 0 }),
      ],
    });
    expect(result.templates[0]).toMatchObject({ validityMode: 'days_after_claim', validDays: 45 });
    expect(result.templates[1]).toMatchObject({
      validityMode: 'fixed_window',
      validDays: null,
      validFrom: new Date(1700000000 * 1000),
      validTo: new Date(1710000000 * 1000),
    });
    expect(result.templates[2]).toMatchObject({ validityMode: 'days_after_claim', validDays: 30 });
  });

  it('turns the legacy sentinels into NULL', () => {
    const [unlimited, limited] = mapCoupons({
      issues: [
        issue({ id: 60, is_permanent: 1, receive_limit: 0 }),
        issue({ id: 61, is_permanent: 0, total_count: 100, remain_count: 40, receive_limit: 2 }),
      ],
    }).templates;

    // `is_permanent = 1` → no counters at all (the supply-shape CHECK).
    expect(unlimited).toMatchObject({
      isUnlimitedSupply: true,
      totalCount: null,
      remainingCount: null,
      // `receive_limit = 0` meant unlimited.
      perUserLimit: null,
    });
    expect(limited).toMatchObject({
      isUnlimitedSupply: false,
      totalCount: 100,
      remainingCount: 40,
      perUserLimit: 2,
    });
  });

  it('clamps a remainder that legacy let exceed the total', () => {
    const result = mapCoupons({
      issues: [issue({ id: 70, is_permanent: 0, total_count: 10, remain_count: 999 })],
    });
    expect(result.templates[0]).toMatchObject({ totalCount: 10, remainingCount: 10 });
  });
});

describe('scope links', () => {
  it('splits the one legacy table into products and categories', () => {
    const result = mapCoupons({
      issues: [issue({ id: 4, type: 1 })],
      couponProducts: [
        { coupon_id: 4, product_id: 0, category_id: 1 },
        { coupon_id: 4, product_id: 0, category_id: 2 },
        { coupon_id: 4, product_id: 9, category_id: 0 },
        // A link to a template that is gone: silently dropped, by design.
        { coupon_id: 999, product_id: 1, category_id: 0 },
      ],
    });
    expect(result.templateCategories).toEqual([
      { templateId: 4, categoryId: 1 },
      { templateId: 4, categoryId: 2 },
    ]);
    expect(result.templateProducts).toEqual([{ templateId: 4, productId: 9 }]);
    expect(result.report.scopeLinks).toBe(3);
  });

  it('migrates the product gift links', () => {
    const result = mapCoupons({
      issues: [issue({ id: 5 })],
      productCoupons: [
        { product_id: 11, coupon_id: 5 },
        { product_id: 12, coupon_id: 5 },
        { product_id: 13, coupon_id: 404 },
      ],
    });
    expect(result.productGiftCoupons).toEqual([
      { productId: 11, templateId: 5, sortOrder: 0 },
      { productId: 12, templateId: 5, sortOrder: 1 },
    ]);
  });
});

describe('user coupons', () => {
  it('numbers claim_slot densely per (template, user)', () => {
    // `user_coupons_slot_uq` is what enforces the per-user limit afterwards, so
    // a gap or a duplicate here breaks claiming for that user forever.
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [
        userCoupon({ id: 5, uid: 100 }),
        userCoupon({ id: 3, uid: 100 }),
        userCoupon({ id: 4, uid: 200 }),
        userCoupon({ id: 9, uid: 100 }),
      ],
    });
    // Ordered by legacy id, so the oldest coupon gets slot 1.
    expect(result.userCoupons.map((c) => [c.id, c.userId, c.claimSlot])).toEqual([
      [3, 100, 1],
      [4, 200, 1],
      [5, 100, 2],
      [9, 100, 3],
    ]);
  });

  it('maps the status, and gives a used coupon the used_at the CHECK insists on', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [
        userCoupon({ id: 1, status: 0 }),
        userCoupon({ id: 2, status: 1, use_time: 1676400000 }),
        userCoupon({ id: 3, status: 2 }),
        userCoupon({ id: 4, status: 0, is_fail: 1 }),
        // Legacy data really does contain `status = 1` with no `use_time`.
        userCoupon({ id: 5, status: 1, use_time: 0 }),
      ],
    });
    expect(result.userCoupons.map((c) => c.status)).toEqual([
      'unused',
      'used',
      'expired',
      'revoked',
      'used',
    ]);
    expect(result.userCoupons[1]?.usedAt).toEqual(new Date(1676400000 * 1000));
    expect(result.userCoupons[0]?.usedAt).toBeNull();
    // Fallback so `(status = 'used') = (used_at is not null)` holds.
    expect(result.userCoupons[4]?.usedAt).toEqual(new Date(1676279814 * 1000));
  });

  it('is_fail outranks the status', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [userCoupon({ id: 1, status: 1, use_time: 1676400000, is_fail: 1 })],
    });
    expect(result.userCoupons[0]).toMatchObject({ status: 'revoked', usedAt: null });
  });

  it('snapshots the amounts from the wallet row, not from the template', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3, coupon_price: '7.00', use_min_price: '100.00' })],
      // The campaign was edited after this coupon was issued.
      couponUsers: [
        userCoupon({ id: 1, coupon_title: '旧名字', coupon_price: '5.00', use_min_price: '50.00' }),
      ],
    });
    expect(result.userCoupons[0]).toMatchObject({
      title: '旧名字',
      discountAmount: '5.00',
      minSpend: '50.00',
    });
  });

  it('drops coupons whose template or owner did not survive, and counts both', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 }), issue({ id: 2, receive_type: 4 })],
      couponUsers: [
        userCoupon({ id: 1, cid: 3, uid: 100 }),
        // Its template was the member coupon.
        userCoupon({ id: 2, cid: 2, uid: 100 }),
        userCoupon({ id: 3, cid: 3, uid: 999 }),
      ],
      keptUserIds: new Set([100]),
    });
    expect(result.report).toMatchObject({
      userCoupons: 1,
      userCouponsDroppedUnknownTemplate: 1,
      userCouponsDroppedUnknownUser: 1,
    });
  });

  it('keeps every coupon when no user filter is given', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [userCoupon({ id: 1, uid: 1 }), userCoupon({ id: 2, uid: 2 })],
    });
    expect(result.report.userCoupons).toBe(2);
    expect(result.report.userCouponsDroppedUnknownUser).toBe(0);
  });

  it('maps the legacy source text, defaulting to admin_grant', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [
        userCoupon({ id: 1, type: 'get' }),
        userCoupon({ id: 2, type: 'new' }),
        userCoupon({ id: 3, type: 'send' }),
        userCoupon({ id: 4, type: '' }),
      ],
    });
    expect(result.userCoupons.map((c) => c.sourceKind)).toEqual([
      'claim',
      'gift_new_user',
      'gift_order',
      'admin_grant',
    ]);
  });

  it('never leaves source_order_id set, because legacy did not record it', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [userCoupon({ id: 1, type: 'send' })],
    });
    // The `gift_order` idempotency index therefore ignores migrated rows.
    expect(result.userCoupons[0]?.sourceOrderId).toBeNull();
  });

  it('fills a missing window rather than writing a row the schema refuses', () => {
    const result = mapCoupons({
      issues: [issue({ id: 3 })],
      couponUsers: [userCoupon({ id: 1, start_time: 0, end_time: 0, add_time: 1676279814 })],
    });
    const coupon = result.userCoupons[0]!;
    expect(coupon.validFrom).toEqual(new Date(1676279814 * 1000));
    expect(coupon.validTo.getTime() - coupon.validFrom.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

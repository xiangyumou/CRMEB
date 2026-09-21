// coupon DTOs → the legacy 优惠券 view models.
//
// Contract: next/packages/contracts/src/coupon/coupon.storefront.contract.ts
//
// Two different legacy shapes share one page family:
//   * a *template* (可领取) — `id` is the template id and `is_use` means "already taken"
//   * a *user coupon* (我的) — `id` is the issued coupon and `_type` is its state

import { toId, toInt, money, text, mapList, unixSeconds, legacyDate } from './_shared.js';

/** legacy `type`: 0 通用, 1 品类, 2 商品 */
function legacyScope(scope) {
  if (scope === 'categories') return 1;
  if (scope === 'products') return 2;
  return 0;
}

/** `couponTemplate` → one 领券中心 row. */
export function toLegacyCouponTemplate(dto) {
  if (!dto) return {};
  const permanent = dto.validityMode === 'days_after_claim';
  return {
    id: toId(dto.templateId),
    coupon_id: toId(dto.templateId),
    title: text(dto.name),
    name: text(dto.name),
    coupon_title: text(dto.name),
    coupon_price: money(dto.discountAmount),
    use_min_price: money(dto.minSpend),
    type: legacyScope(dto.scope),
    applicable_type: legacyScope(dto.scope),
    category_id: '',
    product_id: '',
    is_permanent: permanent ? 1 : 0,
    coupon_time: toInt(dto.validDays, 0),
    start_use_time: unixSeconds(dto.validFrom, 0),
    end_use_time: unixSeconds(dto.validTo, 0),
    start_time: legacyDate(dto.validFrom),
    end_time: legacyDate(dto.validTo),
    use_title: permanent
      ? `领取后 ${toInt(dto.validDays, 0)} 天内可用`
      : `${legacyDate(dto.validFrom)} - ${legacyDate(dto.validTo)}`,
    receive_limit: toInt(dto.perUserLimit, 0),
    receive_type: 1,
    remain_count: dto.isUnlimitedSupply ? -1 : toInt(dto.remainingCount, 0),
    is_unlimited: dto.isUnlimitedSupply ? 1 : 0,
    // `is_use` gates the 立即领取 button: truthy means "already claimed / unavailable".
    is_use: dto.canClaim ? 0 : 1,
    count: toInt(dto.claimedCount, 0),
  };
}

/** `GET /api/v1/coupons` → `{list, count}`; `count` is the per-tab badge array. */
export function toLegacyCouponList(dto) {
  return {
    list: mapList(dto && dto.items, toLegacyCouponTemplate),
    count: [toInt(dto && dto.total, 0)],
    total: toInt(dto && dto.total, 0),
  };
}

/** `GET /api/v1/coupons/new-user` → the bare array the 新人券弹窗 renders. */
export function toLegacyCouponArray(dto) {
  return mapList(dto && dto.items, toLegacyCouponTemplate);
}

const USER_COUPON_TYPE = { unused: 0, used: 1, expired: 2 };
const USER_COUPON_MSG = { unused: '未使用', used: '已使用', expired: '已过期' };

/** `userCoupon` → one 我的优惠券 row. */
export function toLegacyUserCoupon(dto) {
  if (!dto) return {};
  const state = text(dto.status, 'unused');
  return {
    id: toId(dto.id),
    coupon_id: toId(dto.templateId),
    title: text(dto.title),
    name: text(dto.title),
    coupon_title: text(dto.title),
    coupon_price: money(dto.discountAmount),
    use_min_price: money(dto.minSpend),
    type: legacyScope(dto.scope),
    applicable_type: legacyScope(dto.scope),
    status: USER_COUPON_TYPE[state] === undefined ? 0 : USER_COUPON_TYPE[state],
    _type: USER_COUPON_TYPE[state] === undefined ? 0 : USER_COUPON_TYPE[state],
    _msg: USER_COUPON_MSG[state] || '',
    is_use: state === 'unused' ? 0 : 1,
    add_time: unixSeconds(dto.createdAt, 0),
    use_time: unixSeconds(dto.usedAt, 0),
    start_time: legacyDate(dto.validFrom),
    end_time: legacyDate(dto.validTo),
    start_use_time: unixSeconds(dto.validFrom, 0),
    end_use_time: unixSeconds(dto.validTo, 0),
    use_title: `${legacyDate(dto.validFrom)} - ${legacyDate(dto.validTo)}`,
    source: text(dto.sourceKind, 'claim'),
  };
}

export function toLegacyUserCouponList(dto) {
  return mapList(dto && dto.items, toLegacyUserCoupon);
}

/** `POST /api/v1/coupons/:id/claims` → what `setCouponReceive` resolved with. */
export function toLegacyClaimResult(dto) {
  return {
    coupon: toLegacyUserCoupon(dto && dto.coupon),
    remain_count: toInt(dto && dto.remainingCount, 0),
  };
}

/**
 * `POST /api/v1/user-coupons/applicable` → `getCouponsOrderPrice`, the coupon picker on
 * the 确认订单 page. Only the usable ones were ever listed.
 */
export function toLegacyApplicableCoupons(dto) {
  return mapList(dto && dto.items, (row) => ({
    ...toLegacyUserCoupon(row.coupon),
    usable: row.usable !== false,
    discount: money(row.discount),
    reason: text(row.reason),
  })).filter((c) => c.usable);
}

/** Legacy `getCouponsOrderPrice(price, {cartId})` → the applicable-coupon body. */
export function fromLegacyApplicableInput(price, data) {
  const src = data || {};
  const lines = Array.isArray(src.lines) ? src.lines : null;
  if (lines) return { lines };
  return {
    lines: [
      {
        productId: String(src.productId || '0'),
        categoryIds: [],
        amount: money(price),
      },
    ],
  };
}

/** Legacy 我的优惠券 tab index (0 全部 / 1 未使用 / 2 已使用) → `state`. */
export function fromLegacyCouponState(types) {
  const n = toInt(types, 0);
  if (n === 1) return 'unused';
  if (n === 2) return 'used';
  if (n === 3) return 'expired';
  return 'all';
}

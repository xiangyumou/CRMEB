// coupon DTOs → the legacy 优惠券 view models.
//
// Contract: next/packages/contracts/src/coupon/coupon.storefront.contract.ts
//
// Two different legacy shapes share one page family:
//   * a *template* (可领取) — `id` is the template id and `is_use` means "already taken"
//   * a *user coupon* (我的) — `id` is the issued coupon and `_type` is its state

import { toId, toInt, money, text, list, mapList, unixSeconds, legacyDate } from './_shared.js';

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

/** A `couponTemplate` page → the bare array a list component renders (DIY 优惠券). */
export function toLegacyCouponArray(dto) {
  return mapList(dto && dto.items, toLegacyCouponTemplate);
}

/**
 * `GET /api/v1/coupons` → the 首页 / 微页面 coupon popup (`couponWindow`), which
 * legacy fed from `/v2/get_today_coupon` as `{list, image}`; the pages read
 * `data.list.length` (CR-4-i §3). Only templates this shopper can still claim:
 * the popup's one button is 立即领取, and a coupon already taken is not an
 * offer. `image` was legacy `coupon_img`, which the site config does not carry;
 * `couponWindow` does not render it.
 */
export function toLegacyCouponPopup(dto) {
  const claimable = list(dto && dto.items).filter((item) => item && item.canClaim === true);
  return { list: claimable.map(toLegacyCouponTemplate), image: '' };
}

/**
 * `GET /api/v1/coupons/new-user` → the 新人券 popup's `{list, image, show}`.
 *
 * Legacy `show` was 1 only on the member's first visit (`add_time ===
 * last_time`), and the popup announced the coupons registration had just
 * issued. The route answers the new-user templates, not whether this visit is
 * the first, so `show` is 0: the page then marks the device `oldUser` and never
 * shows a returning member a "welcome" popup. The coupons themselves are in
 * 我的优惠券.
 */
export function toLegacyNewUserCouponPopup(dto) {
  return { list: toLegacyCouponArray(dto), image: '', show: 0 };
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
  // The 确认订单 picker passes its `cartInfo` (`toLegacyCheckoutLine` rows):
  // one line per product, at the line's total (CR-4-i §11). The checkout
  // line carries no category ids, so a category-scoped coupon cannot be
  // matched from here — CR-1-h4.
  const cartInfo = Array.isArray(src.cartInfo) ? src.cartInfo.filter(Boolean) : [];
  if (cartInfo.length) {
    return {
      lines: cartInfo.map((line) => ({
        productId: String(line.product_id),
        categoryIds: [],
        amount: money(line.sum_price),
      })),
    };
  }
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

// ---------------------------------------------------------------------------
// 支付成功页的「恭喜获得优惠券」 (B3 — GET /api/v1/orders/:id/gift-coupons)
// ---------------------------------------------------------------------------

/**
 * 订单赠券 → 支付成功页的弹层。条目就是 我的优惠券 的 `userCoupon`，只有一处不同：
 * 弹层把 `add_time` 当作有效期的起点拼在 `end_time` 前面（「有效期:2026-01-01-2026-12-31」），
 * 所以这里给日期串，而不是 我的优惠券 用的 unix 秒。
 */
export function toLegacyGiftCoupons(dto) {
  return mapList(dto && dto.items, (item) => ({
    ...toLegacyUserCoupon(item),
    add_time: legacyDate(item && item.validFrom),
  }));
}

// ---------------------------------------------------------------------------
// 店员赠送优惠券 (B3 — coupon.staff.contract.ts)
// ---------------------------------------------------------------------------

/**
 * 抽屉的查询 `{coupon_title}` → `{keyword, page, pageSize}`。抽屉不翻页，一次取满
 * `pageSize` 的上限 100；店里在售的券超过一百张时，搜索框就是翻页。
 */
export function fromLegacyStaffCouponQuery(data) {
  const src = data || {};
  const out = { page: 1, pageSize: 100 };
  const keyword = text(src.coupon_title !== undefined ? src.coupon_title : src.keyword).trim();
  if (keyword) out.keyword = keyword.slice(0, 50);
  return out;
}

/**
 * `staffCoupon` → 赠券抽屉的一行。`coupon_time` 非零时抽屉显示「有效期：N 天」，
 * 否则用 `start_use_time` / `end_use_time`（unix 秒，抽屉自己 `*1000`）拼日期。
 */
export function toLegacyStaffCoupon(dto) {
  if (!dto) return {};
  const byDays = dto.validityMode === 'days_after_claim';
  return {
    id: toId(dto.id),
    coupon_title: text(dto.name),
    coupon_price: money(dto.discountAmount),
    use_min_price: money(dto.minSpend),
    type: legacyScope(dto.scope),
    coupon_time: byDays ? toInt(dto.validDays, 0) : 0,
    start_use_time: byDays ? 0 : unixSeconds(dto.validFrom, 0),
    end_use_time: byDays ? 0 : unixSeconds(dto.validTo, 0),
    // 售罄的券也列出来（B3：让店员看得到为什么发不出去），抽屉目前不读这两个字段
    remain_count: dto.isUnlimitedSupply ? -1 : toInt(dto.remainingCount, 0),
    is_unlimited: dto.isUnlimitedSupply ? 1 : 0,
  };
}

/** 抽屉读 `res.data` 为裸数组。 */
export function toLegacyStaffCoupons(dto) {
  return mapList(dto && dto.items, toLegacyStaffCoupon);
}

/** 一位客户一张券：`{userId, couponId}`（B3，单数，扇出在 api/admin.js）。 */
export function fromLegacyCouponGrant(uid, couponId) {
  return { userId: text(uid).trim(), couponId: text(couponId).trim() };
}

/**
 * 扇出后的若干个 `{granted, skippedUserIds}` → 抽屉 toast 的那句话。已达领取上限的
 * 客户是 200 + `skippedUserIds`，不是错误（B3），所以要说出来，不能一律「赠送成功」。
 */
export function couponGrantMessage(results) {
  let granted = 0;
  let skipped = 0;
  list(results).forEach((res) => {
    granted += toInt(res && res.granted, 0);
    skipped += list(res && res.skippedUserIds).length;
  });
  if (!skipped) return '赠送成功';
  if (!granted) return '客户已达该券的领取上限';
  return `已赠送 ${granted} 人，${skipped} 人已达领取上限`;
}

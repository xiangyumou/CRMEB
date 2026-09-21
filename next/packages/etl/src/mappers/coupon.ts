/**
 * Legacy coupon tables → the new coupon schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                      | New                                        |
 * | --------------------------- | ------------------------------------------ |
 * | `eb_store_coupon_issue`     | `coupon_templates`                         |
 * | `eb_store_coupon_product`   | `coupon_template_products` / `_categories` |
 * | `eb_store_product_coupon`   | `product_gift_coupons`                     |
 * | `eb_store_coupon_user`      | `user_coupons`                             |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock, so the test below runs on literal rows
 * copied out of the legacy dump.
 *
 * Two legacy tables are deliberately NOT read:
 *
 *  - `eb_store_coupon_issue_user` (who claimed what) — every row it holds is
 *    implied by `eb_store_coupon_user`, which is the wallet, and the new
 *    `claim_slot` is derived per user from that;
 *  - `eb_store_coupon` — in this deployment the "template" is
 *    `eb_store_coupon_issue`; `cid` is legacy dead weight.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_store_coupon_issue`. Timestamps are unix seconds; `0` means "unset". */
export interface LegacyCouponIssue {
  id: number;
  title: string;
  coupon_price: string;
  use_min_price: string;
  /** Validity in days, used when `start_use_time` / `end_use_time` are 0. */
  coupon_time: number;
  start_use_time: number;
  end_use_time: number;
  /** The claim window. */
  start_time: number;
  end_time: number;
  total_count: number;
  remain_count: number;
  /** 0 = unlimited claims per user. */
  receive_limit: number;
  /** 1 = unlimited supply. */
  is_permanent: number;
  /** 1 正常, 0 未开启, -1 已无效. */
  status: number;
  /** 0 通用, 1 品类券, 2 商品券. */
  type: number;
  /** 1 手动领取, 2 新人券, 3 赠送券, 4 会员券 (retired). */
  receive_type: number;
  /** 1 = the coupon is given away when an order passes `full_reduction`. */
  is_full_give: number;
  full_reduction: string;
  is_del: number;
  add_time: number;
  sort: number;
}

/** `eb_store_coupon_product`. One of the two id columns is 0. */
export interface LegacyCouponProduct {
  coupon_id: number;
  product_id: number;
  category_id: number;
}

/** `eb_store_product_coupon` — "buy this product, get this coupon". */
export interface LegacyProductCoupon {
  product_id: number;
  coupon_id: number;
}

/** `eb_store_coupon_user` — the wallet. */
export interface LegacyCouponUser {
  id: number;
  /** The template id (`eb_store_coupon_issue.id`). */
  cid: number;
  uid: number;
  coupon_title: string;
  coupon_price: string;
  use_min_price: string;
  add_time: number;
  start_time: number;
  end_time: number;
  use_time: number;
  /** `send` / `get` / `buy` … free text in the legacy schema. */
  type: string;
  /** 0 未使用, 1 已使用, 2 已过期. */
  status: number;
  /** 1 = voided. */
  is_fail: number;
}

// ---------------------------------------------------------------------------
// output row shapes (a subset of the Drizzle insert types, by hand so that
// `@shop/etl` does not depend on `@shop/db` before the runner exists)
// ---------------------------------------------------------------------------

export type CouponScope = 'all_products' | 'categories' | 'products';
export type CouponClaimMode = 'manual' | 'new_user' | 'order_gift' | 'admin_grant';
export type CouponValidityMode = 'fixed_window' | 'days_after_claim';
export type CouponTemplateStatus = 'draft' | 'active' | 'disabled';
export type UserCouponStatus = 'unused' | 'used' | 'expired' | 'revoked';
export type UserCouponSourceKind = 'claim' | 'gift_order' | 'gift_new_user' | 'admin_grant';

export interface CouponTemplateRow {
  id: number;
  name: string;
  scope: CouponScope;
  claimMode: CouponClaimMode;
  status: CouponTemplateStatus;
  discountAmount: string;
  minSpend: string;
  validityMode: CouponValidityMode;
  validFrom: Date | null;
  validTo: Date | null;
  validDays: number | null;
  claimFrom: Date | null;
  claimTo: Date | null;
  isUnlimitedSupply: boolean;
  totalCount: number | null;
  remainingCount: number | null;
  perUserLimit: number | null;
  giftMinOrderAmount: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CouponTemplateProductRow {
  templateId: number;
  productId: number;
}

export interface CouponTemplateCategoryRow {
  templateId: number;
  categoryId: number;
}

export interface ProductGiftCouponRow {
  productId: number;
  templateId: number;
  sortOrder: number;
}

export interface UserCouponRow {
  id: number;
  templateId: number;
  userId: number;
  claimSlot: number;
  sourceKind: UserCouponSourceKind;
  sourceOrderId: number | null;
  title: string;
  discountAmount: string;
  minSpend: string;
  status: UserCouponStatus;
  validFrom: Date;
  validTo: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Why a row was not migrated. Every count here is reported, never swallowed. */
export interface CouponMigrationReport {
  templates: number;
  templatesDroppedMemberCoupon: number;
  templatesDroppedDeleted: number;
  scopeLinks: number;
  productGifts: number;
  userCoupons: number;
  userCouponsDroppedUnknownTemplate: number;
  userCouponsDroppedUnknownUser: number;
  /** Ids of the templates that were dropped, so a human can check them off. */
  droppedTemplateIds: number[];
}

export interface CouponMigrationInput {
  issues: readonly LegacyCouponIssue[];
  couponProducts?: readonly LegacyCouponProduct[];
  productCoupons?: readonly LegacyProductCoupon[];
  couponUsers?: readonly LegacyCouponUser[];
  /** Ids that survived the user migration. A coupon held by a deleted account is dropped. */
  keptUserIds?: ReadonlySet<number>;
}

export interface CouponMigrationOutput {
  templates: CouponTemplateRow[];
  templateProducts: CouponTemplateProductRow[];
  templateCategories: CouponTemplateCategoryRow[];
  productGiftCoupons: ProductGiftCouponRow[];
  userCoupons: UserCouponRow[];
  report: CouponMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

/** Legacy unix seconds; `0` is the legacy way of saying NULL. */
function instant(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function scopeOf(legacyType: number): CouponScope {
  if (legacyType === 1) return 'categories';
  if (legacyType === 2) return 'products';
  return 'all_products';
}

/**
 * `receive_type` 1/2/3 → the new claim modes. `4` (会员券) has no new mode:
 * membership was retired with the member level feature, so those templates are
 * dropped and counted — COUPON-001 / COUPON-002.
 */
function claimModeOf(issue: LegacyCouponIssue): CouponClaimMode | null {
  if (issue.receive_type === 4) return null;
  if (issue.receive_type === 2) return 'new_user';
  if (issue.receive_type === 3 || issue.is_full_give === 1) return 'order_gift';
  return 'manual';
}

function statusOf(legacyStatus: number): CouponTemplateStatus {
  if (legacyStatus === 1) return 'active';
  if (legacyStatus === 0) return 'draft';
  return 'disabled';
}

export function mapCoupons(input: CouponMigrationInput): CouponMigrationOutput {
  const templates: CouponTemplateRow[] = [];
  const templateProducts: CouponTemplateProductRow[] = [];
  const templateCategories: CouponTemplateCategoryRow[] = [];
  const productGiftCoupons: ProductGiftCouponRow[] = [];
  const userCoupons: UserCouponRow[] = [];
  const droppedTemplateIds: number[] = [];

  let templatesDroppedMemberCoupon = 0;
  let templatesDroppedDeleted = 0;
  let userCouponsDroppedUnknownTemplate = 0;
  let userCouponsDroppedUnknownUser = 0;

  const kept = new Set<number>();

  for (const issue of input.issues) {
    if (issue.is_del === 1) {
      // Legacy soft-deletes are not resurrected: a deleted campaign that never
      // issued anything is noise, and one that did keeps its wallet rows
      // through the snapshot on `user_coupons`.
      templatesDroppedDeleted += 1;
      droppedTemplateIds.push(issue.id);
      continue;
    }
    const claimMode = claimModeOf(issue);
    if (claimMode === null) {
      templatesDroppedMemberCoupon += 1;
      droppedTemplateIds.push(issue.id);
      continue;
    }

    const createdAt = instant(issue.add_time) ?? new Date(0);
    const fixedFrom = instant(issue.start_use_time);
    const fixedTo = instant(issue.end_use_time);
    // A template carries either a fixed window or a day count. Legacy allowed
    // both to be empty; those become the 30-day default rather than a template
    // the CHECK constraint would reject.
    const fixedWindow = fixedFrom !== null && fixedTo !== null;

    const unlimited = issue.is_permanent === 1;
    const total = unlimited ? null : issue.total_count;
    const remaining = unlimited ? null : Math.min(issue.remain_count, issue.total_count);

    templates.push({
      id: issue.id,
      name: issue.title,
      scope: scopeOf(issue.type),
      claimMode,
      status: statusOf(issue.status),
      discountAmount: issue.coupon_price,
      minSpend: issue.use_min_price,
      validityMode: fixedWindow ? 'fixed_window' : 'days_after_claim',
      validFrom: fixedWindow ? fixedFrom : null,
      validTo: fixedWindow ? fixedTo : null,
      validDays: fixedWindow ? null : issue.coupon_time > 0 ? issue.coupon_time : 30,
      claimFrom: instant(issue.start_time),
      claimTo: instant(issue.end_time),
      isUnlimitedSupply: unlimited,
      totalCount: total,
      // `remain_count > total_count` happens in the legacy data; the new CHECK
      // refuses it, so it is clamped rather than left to blow up mid-import.
      remainingCount: remaining,
      // `receive_limit = 0` means unlimited, which is NULL now.
      perUserLimit: issue.receive_limit > 0 ? issue.receive_limit : null,
      giftMinOrderAmount:
        claimMode === 'order_gift' && Number(issue.full_reduction) > 0
          ? issue.full_reduction
          : null,
      sortOrder: issue.sort,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
    kept.add(issue.id);
  }

  // Scope links. The legacy table puts a product id OR a category id in each
  // row, with the other column 0, and keeps rows for templates that are long
  // gone — so both are filtered.
  for (const link of input.couponProducts ?? []) {
    if (!kept.has(link.coupon_id)) continue;
    if (link.product_id > 0) {
      templateProducts.push({ templateId: link.coupon_id, productId: link.product_id });
    } else if (link.category_id > 0) {
      templateCategories.push({ templateId: link.coupon_id, categoryId: link.category_id });
    }
  }

  for (const [index, gift] of (input.productCoupons ?? []).entries()) {
    if (!kept.has(gift.coupon_id)) continue;
    productGiftCoupons.push({
      productId: gift.product_id,
      templateId: gift.coupon_id,
      sortOrder: index,
    });
  }

  // `claim_slot` is per (template, user) and has to be dense from 1, because
  // `user_coupons_slot_uq` is what enforces the per-user limit afterwards.
  const slots = new Map<string, number>();
  const ordered = [...(input.couponUsers ?? [])].sort((a, b) => a.id - b.id);

  for (const row of ordered) {
    if (!kept.has(row.cid)) {
      userCouponsDroppedUnknownTemplate += 1;
      continue;
    }
    if (input.keptUserIds && !input.keptUserIds.has(row.uid)) {
      userCouponsDroppedUnknownUser += 1;
      continue;
    }

    const key = `${row.cid}:${row.uid}`;
    const slot = (slots.get(key) ?? 0) + 1;
    slots.set(key, slot);

    const createdAt = instant(row.add_time) ?? new Date(0);
    const validFrom = instant(row.start_time) ?? createdAt;
    const validTo = instant(row.end_time) ?? new Date(createdAt.getTime() + 30 * DAY_MS);
    const usedAt = instant(row.use_time);
    // `is_fail` outranks `status`: a voided coupon is `revoked` whatever the
    // legacy status said. `used` must carry a `used_at`, or the CHECK
    // `user_coupons_used_at_present` refuses the row — hence the fallback.
    const status: UserCouponStatus = row.is_fail === 1 ? 'revoked' : userStatusOf(row);

    userCoupons.push({
      id: row.id,
      templateId: row.cid,
      userId: row.uid,
      claimSlot: slot,
      sourceKind: sourceKindOf(row.type),
      // The legacy wallet row does not record which order earned it, so the
      // `gift_order` idempotency index has nothing to key on for old rows.
      sourceOrderId: null,
      title: row.coupon_title,
      discountAmount: row.coupon_price,
      minSpend: row.use_min_price,
      status,
      validFrom,
      validTo,
      usedAt: status === 'used' ? (usedAt ?? createdAt) : null,
      createdAt,
      updatedAt: usedAt ?? createdAt,
    });
  }

  return {
    templates,
    templateProducts,
    templateCategories,
    productGiftCoupons,
    userCoupons,
    report: {
      templates: templates.length,
      templatesDroppedMemberCoupon,
      templatesDroppedDeleted,
      scopeLinks: templateProducts.length + templateCategories.length,
      productGifts: productGiftCoupons.length,
      userCoupons: userCoupons.length,
      userCouponsDroppedUnknownTemplate,
      userCouponsDroppedUnknownUser,
      droppedTemplateIds,
    },
  };
}

function userStatusOf(row: LegacyCouponUser): UserCouponStatus {
  if (row.status === 1) return 'used';
  if (row.status === 2) return 'expired';
  return 'unused';
}

/**
 * Legacy `type` is free text describing where the coupon came from. Anything
 * unrecognised becomes `admin_grant`, which is the honest answer: somebody put
 * it there and we cannot say how.
 */
function sourceKindOf(legacyType: string): UserCouponSourceKind {
  switch (legacyType) {
    case 'get':
    case 'receive':
      return 'claim';
    case 'new':
    case 'register':
      return 'gift_new_user';
    case 'send':
    case 'buy':
      return 'gift_order';
    default:
      return 'admin_grant';
  }
}

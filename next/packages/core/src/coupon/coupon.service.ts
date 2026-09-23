import type {
  AdminUserCoupon,
  AdminUserCouponListQuery,
  ApplicableCoupon,
  ApplicableCouponsBody,
  ApplicableCouponsResult,
  ClaimResult,
  ClaimableCoupon,
  CouponGrantBody,
  CouponGrantResult,
  CouponTemplateDetail,
  CouponTemplateForm,
  CouponTemplateListItem,
  CouponTemplateListQuery,
  CouponTemplateStatusBody,
  MyCouponListQuery,
  StaffCoupon,
  StaffCouponGrantBody,
  StaffCouponListQuery,
  StaffUserCouponListQuery,
  StaffUserCoupons,
  UserCoupon,
} from '@shop/contracts/coupon/schemas';
import { STAFF_USER_COUPON_LIMIT } from '@shop/contracts/coupon/schemas';
import type { PageQuery } from '@shop/contracts/conventions';
import type { Tx } from '@shop/db';
import { DomainError } from '../kernel/errors';
import { Money } from '../kernel/money';
import { requireUserId, type Ctx } from '../kernel/context';
import {
  isClaimWindowOpen,
  quoteLines,
  windowForIssue,
  type CouponLine,
  type CouponTerms,
} from './coupon.rules';
import * as repo from './coupon.repo';

/**
 * Coupon domain services.
 *
 * Plain functions taking `(ctx, input)` — no classes, no module-level state —
 * so a route file is the one line CONVENTIONS asks for
 * (`handle(route, (ctx, { query }) => couponService.adminList(ctx, query))`)
 * and a test needs nothing but `createTestCtx()`.
 *
 * Shape to copy:
 *  - the service decides, the repo states. Every `if` about a row count is
 *    here; every SQL statement is in `coupon.repo.ts`.
 *  - anything that changes state is wrapped in exactly one `ctx.withTx`, at the
 *    top. Nested services reuse it (`withTx` reuses an open transaction).
 *  - the row → DTO mapping is one small function per shape at the bottom, so
 *    "what does the wire look like" is answered in one place.
 */

// ---------------------------------------------------------------------------
// admin — templates
// ---------------------------------------------------------------------------

export async function adminList(
  ctx: Ctx,
  query: CouponTemplateListQuery,
): Promise<{ items: CouponTemplateListItem[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repo.listTemplates(ctx.db, {
    keyword: query.keyword,
    status: asArray(query.status),
    scope: query.scope,
    claimMode: query.claimMode,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...pageBounds(query),
  });
  const issued = await repo.issuedCounts(
    ctx.db,
    rows.map((r) => r.id),
  );
  return {
    items: rows.map((row) => toListItem(row, issued.get(row.id) ?? 0)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function adminDetail(ctx: Ctx, input: { id: string }): Promise<CouponTemplateDetail> {
  const id = Number(input.id);
  const row = await repo.findTemplate(ctx.db, id);
  if (!row) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
  const [links, issued] = await Promise.all([
    repo.scopeLinks(ctx.db, id),
    repo.issuedCounts(ctx.db, [id]),
  ]);
  return toDetail(row, issued.get(id) ?? 0, links);
}

export async function adminCreate(
  ctx: Ctx,
  body: CouponTemplateForm,
): Promise<CouponTemplateDetail> {
  return ctx.withTx(async (tx) => {
    const now = ctx.clock.now();
    const row = await repo.insertTemplate(tx, {
      ...templateValues(body),
      createdAt: now,
      updatedAt: now,
    });
    await repo.replaceScopeLinks(tx, row.id, scopeLinksOf(body));
    return toDetail(row, 0, { productIds: body.productIds, categoryIds: body.categoryIds });
  });
}

/**
 * Edit.
 *
 * The one interesting line is the supply: legacy reset `remain_count =
 * total_count` on every edit (`StoreCouponIssueServices::saveCoupon` :79-84),
 * so renaming a 1000-coupon campaign that had 3 left handed out 997 more. Here
 * the *delta* is applied — raise the total by 100 and 100 more become
 * claimable; lower it and the remainder shrinks, floored at zero.
 */
export async function adminUpdate(
  ctx: Ctx,
  input: { id: string },
  body: CouponTemplateForm,
): Promise<CouponTemplateDetail> {
  const id = Number(input.id);
  return ctx.withTx(async (tx) => {
    const current = await repo.findTemplate(tx, id);
    if (!current) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');

    const values = templateValues(body);
    if (!body.isUnlimitedSupply) {
      const nextTotal = body.totalCount!;
      const previousTotal = current.totalCount;
      const previousRemaining = current.remainingCount;
      values.remainingCount =
        previousTotal === null || previousRemaining === null
          ? // Was unlimited: the whole new supply is fresh.
            nextTotal
          : Math.max(0, Math.min(nextTotal, previousRemaining + (nextTotal - previousTotal)));
    }
    values.updatedAt = ctx.clock.now();

    const { won } = await repo.updateTemplate(tx, id, values);
    if (!won) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    await repo.replaceScopeLinks(tx, id, scopeLinksOf(body));

    const row = (await repo.findTemplate(tx, id))!;
    const issued = await repo.issuedCounts(tx, [id]);
    return toDetail(row, issued.get(id) ?? 0, {
      productIds: body.productIds,
      categoryIds: body.categoryIds,
    });
  });
}

export async function adminSetStatus(
  ctx: Ctx,
  input: { id: string },
  body: CouponTemplateStatusBody,
): Promise<CouponTemplateDetail> {
  const id = Number(input.id);
  return ctx.withTx(async (tx) => {
    const { won } = await repo.setTemplateStatus(tx, {
      id,
      // Guarded on where it is coming *from*: two operators toggling at once
      // cannot both be told they did it.
      from: body.status === 'active' ? ['draft', 'disabled'] : ['draft', 'active'],
      to: body.status,
      now: ctx.clock.now(),
    });
    const row = await repo.findTemplate(tx, id);
    if (!row) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    if (!won && row.status !== body.status) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    const [links, issued] = await Promise.all([
      repo.scopeLinks(tx, id),
      repo.issuedCounts(tx, [id]),
    ]);
    return toDetail(row, issued.get(id) ?? 0, links);
  });
}

/**
 * Soft delete. The coupons already in wallets are untouched — `user_coupons`
 * snapshots title, amount and window, so they keep working — which is exactly
 * why `user_coupons.template_id` is `ON DELETE RESTRICT` and this is not a
 * `DELETE`.
 */
export async function adminDelete(ctx: Ctx, input: { id: string }): Promise<void> {
  const id = Number(input.id);
  await ctx.withTx(async (tx) => {
    const { won } = await repo.softDeleteTemplate(tx, { id, now: ctx.clock.now() });
    if (!won) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
  });
}

/**
 * Hand coupons to named users.
 *
 * All-or-nothing on supply: if the template runs out part way through, the
 * whole call is refused rather than reporting "granted 7 of 200". Users who
 * are already at `per_user_limit` are *skipped*, not an error — that is the
 * normal outcome of selecting a group that overlaps a previous grant.
 */
export async function adminGrant(
  ctx: Ctx,
  input: { id: string },
  body: CouponGrantBody,
): Promise<CouponGrantResult> {
  return grant(ctx, Number(input.id), body.userIds.map(Number), { activeOnly: false });
}

/**
 * The one grant path behind both consoles. `activeOnly` is the staff
 * console's: the web console may hand a draft to a test account, a 店员 may
 * only hand out what marketing has released (CR-10-k2). The status is read
 * inside the grant's transaction, so the answer is the one the grant used.
 */
async function grant(
  ctx: Ctx,
  templateId: number,
  userIds: number[],
  options: { activeOnly: boolean },
): Promise<CouponGrantResult> {
  return ctx.withTx(async (tx) => {
    const template = await repo.findTemplate(tx, templateId);
    if (!template) throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    if (options.activeOnly && template.status !== 'active') {
      throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    }

    const known = await repo.existingUserIds(tx, userIds);
    const unknown = userIds.filter((userId) => !known.has(userId));
    if (unknown.length > 0) {
      throw new DomainError('COUPON_GRANT_USER_UNKNOWN', {
        details: { userIds: unknown.map(String) },
      });
    }

    const skippedUserIds: string[] = [];
    let granted = 0;
    for (const userId of [...new Set(userIds)]) {
      const outcome = await issueOne(tx, ctx, {
        template,
        userId,
        sourceKind: 'admin_grant',
      });
      if (outcome.kind === 'issued') granted += 1;
      else if (outcome.kind === 'limit-reached') skippedUserIds.push(String(userId));
      else throw new DomainError('COUPON_SOLD_OUT');
    }
    return { granted, skippedUserIds };
  });
}

export async function adminListUserCoupons(
  ctx: Ctx,
  query: AdminUserCouponListQuery,
): Promise<{ items: AdminUserCoupon[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repo.adminListUserCoupons(ctx.db, {
    templateId: query.templateId ? Number(query.templateId) : undefined,
    userId: query.userId ? Number(query.userId) : undefined,
    status: asArray(query.status),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...pageBounds(query),
  });
  const terms = await repo.templateTermsFor(
    ctx.db,
    rows.map((r) => r.templateId),
  );
  return {
    items: rows.map((row) => ({
      ...toUserCoupon(row, termsOf(terms, row.templateId)),
      userId: String(row.userId),
      userNickname: row.userNickname,
      sourceOrderId: row.sourceOrderId === null ? null : String(row.sourceOrderId),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

// ---------------------------------------------------------------------------
// 移动端店员发券 (CR-5-h2)
// ---------------------------------------------------------------------------

/**
 * The coupons a staff member may hand out: the `active` templates, newest
 * first, optionally filtered by name.
 *
 * `draft` and `disabled` are excluded rather than greyed out. The web console
 * lists them because an operator edits them there; on the phone the only
 * action is 发放, and a row that can never be tapped is a support call.
 *
 * A sold-out template *is* listed, with `remainingCount: 0`. The staff member
 * has to be able to see why the coupon they were told to give out is not
 * working.
 */
export async function staffListCoupons(
  ctx: Ctx,
  query: StaffCouponListQuery,
): Promise<{ items: StaffCoupon[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repo.listTemplates(ctx.db, {
    keyword: query.keyword,
    status: ['active'],
    ...pageBounds(query),
  });
  return {
    items: rows.map(toStaffCoupon),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * One coupon to one customer, from the phone.
 *
 * Delegates to `adminGrant` rather than reimplementing it. Everything that
 * makes a grant correct under load — the supply decrement that can lose,
 * `issueOne`'s insert-before-decrement ordering, the per-user limit reported as
 * a skip rather than an error — lives in exactly one place, so the two consoles
 * cannot drift apart on the questions that cost money.
 */
export async function staffGrant(ctx: Ctx, body: StaffCouponGrantBody): Promise<CouponGrantResult> {
  // `handle()` has checked the roster; a route wired without it fails closed.
  if (ctx.actor.kind !== 'staff') throw new DomainError('FORBIDDEN');
  const userId = Number(body.userId);
  // A 店员 is a storefront account too: granting to it is granting to oneself.
  if (userId === Number(ctx.actor.id)) throw new DomainError('COUPON_GRANT_SELF');
  // Only what marketing has released — the same set the staff coupon list
  // offers. A draft or withdrawn template answers as if it did not exist.
  return grant(ctx, Number(body.couponId), [userId], { activeOnly: true });
}

/**
 * One customer's coupons, for 「查看优惠券」 in the staff console (CR-1-h3).
 *
 * `auth: 'staff'` has already been checked by `handle()`; this checks the
 * actor kind again so that a route wired without the guard fails closed with
 * `FORBIDDEN` instead of handing any signed-in shopper somebody else's wallet.
 *
 * The rows are read by `uid` from the route, never from the actor — the
 * caller is the 店员, not the customer — and the mapping is `toUserCoupon`, the
 * storefront wallet's, so the staff view cannot show a field the customer's
 * own wallet does not.
 */
export async function staffListUserCoupons(
  ctx: Ctx,
  params: { uid: string },
  query: StaffUserCouponListQuery,
): Promise<StaffUserCoupons> {
  if (ctx.actor.kind !== 'staff') throw new DomainError('FORBIDDEN');
  const userId = Number(params.uid);
  if (!(await repo.existingUserIds(ctx.db, [userId])).has(userId)) {
    throw new DomainError('USER_NOT_FOUND');
  }
  const rows = await repo.listUserCouponsForStaff(ctx.db, {
    userId,
    state: query.state,
    now: ctx.clock.now(),
    limit: STAFF_USER_COUPON_LIMIT,
  });
  const terms = await repo.templateTermsFor(
    ctx.db,
    rows.map((row) => row.templateId),
  );
  return { items: rows.map((row) => toUserCoupon(row, termsOf(terms, row.templateId))) };
}

// ---------------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------------

/**
 * The coupons one order earned.
 *
 * The caller (`order.query.service.ts`) has already resolved `:id` and proved
 * the order is this shopper's, which is why this takes ids rather than the
 * route's params: the coupon domain has no business reading `orders`.
 *
 * Empty is a normal answer, so there is no "not found" here at all — an order
 * that earned nothing and an order whose gift templates were all sold out look
 * the same to the buyer, and both are true.
 */
export async function listOrderGifts(
  ctx: Ctx,
  input: { orderId: number; userId: number },
): Promise<{ items: UserCoupon[] }> {
  const rows = await repo.listOrderGiftCoupons(ctx.db, input);
  const terms = await repo.templateTermsFor(
    ctx.db,
    rows.map((row) => row.templateId),
  );
  return { items: rows.map((row) => toUserCoupon(row, termsOf(terms, row.templateId))) };
}

export async function listClaimable(
  ctx: Ctx,
  query: PageQuery,
): Promise<{ items: ClaimableCoupon[]; total: number; page: number; pageSize: number }> {
  const now = ctx.clock.now();
  const { rows, total } = await repo.listClaimable(ctx.db, { now, ...pageBounds(query) });
  const items = await withCallerState(ctx, rows);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/**
 * New-user coupons, for the registration banner.
 *
 * `canClaim` is always false: these are issued by `grantNewUser` when the
 * account is created, never claimed by hand. The list exists so the storefront
 * can advertise what signing up is worth.
 */
export async function listNewUser(ctx: Ctx): Promise<{ items: ClaimableCoupon[] }> {
  const now = ctx.clock.now();
  const rows = await repo.listIssuableByMode(ctx.db, { mode: 'new_user', now });
  const items = await withCallerState(ctx, rows);
  return {
    items: items.map((item) => ({ ...item, canClaim: item.canClaim === null ? null : false })),
  };
}

/**
 * Claim one coupon.
 *
 * Four refusals, in the order the checks get cheaper to be wrong about, and
 * then two that only the database can answer. Everything runs in one
 * transaction so the loser of either race leaves nothing behind.
 */
export async function claim(ctx: Ctx, input: { id: string }): Promise<ClaimResult> {
  const userId = requireUserId(ctx);
  const templateId = Number(input.id);
  const now = ctx.clock.now();

  return ctx.withTx(async (tx) => {
    const template = await repo.findTemplate(tx, templateId);
    if (!template || template.status !== 'active') {
      throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    }
    if (template.claimMode !== 'manual') throw new DomainError('COUPON_NOT_CLAIMABLE');
    if (!isClaimWindowOpen(template, now)) throw new DomainError('COUPON_CLAIM_WINDOW_CLOSED');

    const outcome = await issueOne(tx, ctx, { template, userId, sourceKind: 'claim' });
    if (outcome.kind === 'limit-reached') {
      throw new DomainError('COUPON_PER_USER_LIMIT_REACHED');
    }
    if (outcome.kind === 'sold-out') throw new DomainError('COUPON_SOLD_OUT');

    return {
      coupon: toUserCoupon(outcome.coupon, await repo.templateTerms(tx, templateId)),
      remainingCount: outcome.remainingCount,
    };
  });
}

export async function listMine(
  ctx: Ctx,
  query: MyCouponListQuery,
): Promise<{ items: UserCoupon[]; total: number; page: number; pageSize: number }> {
  const userId = requireUserId(ctx);
  const { rows, total } = await repo.listUserCoupons(ctx.db, {
    userId,
    state: query.state,
    now: ctx.clock.now(),
    ...pageBounds(query),
  });
  const terms = await repo.templateTermsFor(
    ctx.db,
    rows.map((r) => r.templateId),
  );
  return {
    items: rows.map((row) => toUserCoupon(row, termsOf(terms, row.templateId))),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** How many coupons the checkout picker will consider. Beyond this nobody scrolls. */
const PICKER_LIMIT = 100;

/**
 * The checkout picker: every spendable coupon, each with what it would take
 * off this cart and why it would not.
 *
 * Unusable coupons come back too, greyed out. Hiding them is how a customer
 * ends up asking support where their coupon went.
 */
export async function listApplicable(
  ctx: Ctx,
  body: ApplicableCouponsBody,
): Promise<ApplicableCouponsResult> {
  const userId = requireUserId(ctx);
  const now = ctx.clock.now();
  const lines: CouponLine[] = body.lines.map((line) => ({
    productId: Number(line.productId),
    categoryIds: line.categoryIds.map(Number),
    amount: Money.parse(line.amount),
  }));

  const rows = await repo.listSpendableUserCoupons(ctx.db, { userId, now, limit: PICKER_LIMIT });
  const terms = await repo.templateTermsFor(
    ctx.db,
    rows.map((r) => r.templateId),
  );

  const items: ApplicableCoupon[] = rows.map((row) => {
    const applicability = termsOf(terms, row.templateId);
    const outcome = quoteLines(couponTerms(row, applicability), lines);
    return {
      coupon: toUserCoupon(row, applicability),
      usable: outcome.ok,
      discount: (outcome.ok ? outcome.discount : Money.ZERO).toString(),
      eligibleLineIndexes: outcome.eligibleLineIndexes,
      reason: outcome.ok ? null : outcome.reason,
    };
  });

  // Best offer first; a coupon the shopper cannot use never outranks one they can.
  items.sort((a, b) => {
    if (a.usable !== b.usable) return a.usable ? -1 : 1;
    const byDiscount = Money.parse(b.discount).compare(Money.parse(a.discount));
    return byDiscount !== 0 ? byDiscount : Number(a.coupon.id) - Number(b.coupon.id);
  });

  return { items, subtotal: Money.sum(lines.map((line) => line.amount)).toString() };
}

// ---------------------------------------------------------------------------
// domain API — what other streams call (re-exported from index.ts)
// ---------------------------------------------------------------------------

export interface QuoteInput {
  userCouponId: number;
  userId: number;
  lines: readonly CouponLine[];
}

export interface QuoteResult {
  discount: Money;
  eligibleLineIndexes: number[];
  eligibleSubtotal: Money;
}

/**
 * What this coupon takes off this cart. Pure read — it writes nothing, so B1
 * can call it while pricing and again while confirming.
 *
 * The *amounts* come from the wallet row (a snapshot taken when the coupon was
 * issued, so re-pricing a campaign never changes a coupon already held); the
 * *scope* comes from the live template, which is what legacy did by resolving
 * `applicable_type` through the `issue` relation at read time.
 */
export async function quote(ctx: Ctx, input: QuoteInput): Promise<QuoteResult> {
  const row = await repo.findUserCoupon(ctx.db, input.userCouponId);
  if (!row || row.userId !== input.userId) throw new DomainError('COUPON_NOT_FOUND');

  const now = ctx.clock.now();
  if (row.status !== 'unused' || row.validFrom > now || row.validTo < now) {
    throw new DomainError('COUPON_NOT_USABLE');
  }

  const outcome = quoteLines(
    couponTerms(row, await repo.templateTerms(ctx.db, row.templateId)),
    input.lines,
  );
  if (!outcome.ok) {
    throw new DomainError(outcome.reason, {
      details:
        outcome.reason === 'COUPON_MIN_SPEND_NOT_MET' ? { minSpend: row.minSpend } : undefined,
    });
  }
  return {
    discount: outcome.discount,
    eligibleLineIndexes: outcome.eligibleLineIndexes,
    eligibleSubtotal: outcome.eligibleSubtotal,
  };
}

export interface RedeemInput {
  userCouponId: number;
  userId: number;
  /** For the log line only: the link lives on `orders.user_coupon_id` (SCHEMA.md §6.4). */
  orderId: number;
}

/**
 * Spend the coupon, inside the caller's order transaction.
 *
 * One conditional update; zero affected rows throws `COUPON_NOT_USABLE`, which
 * aborts the caller's transaction and therefore the order. Called by B1 from
 * `createOrder`, exactly where legacy called `redeemCoupon`
 * (`StoreOrderCreateServices.php:266-275`) and for the same reason: pricing
 * must not write, and redemption must not happen anywhere but the order's own
 * transaction.
 *
 * The argument order is `(tx, ctx, input)` to match `recordEffect` — the other
 * platform primitive a domain calls from inside somebody else's transaction.
 */
export async function redeem(tx: Tx, ctx: Ctx, input: RedeemInput): Promise<void> {
  const now = ctx.clock.now();
  const { won } = await repo.redeemUserCoupon(tx, {
    id: input.userCouponId,
    userId: input.userId,
    now,
  });
  if (!won) throw new DomainError('COUPON_NOT_USABLE');
  ctx.logger.info(
    { userCouponId: input.userCouponId, orderId: input.orderId, userId: input.userId },
    'coupon redeemed',
  );
}

export interface ReleaseInput {
  userCouponId: number;
  orderId: number;
}

export interface ReleaseResult {
  /** False when the coupon was not in `used` — an already-released coupon, or never spent. */
  released: boolean;
}

/**
 * Give the coupon back on cancel or refund.
 *
 * Returns `{ released }` instead of throwing, because this runs behind the
 * effects ledger and the ledger retries: a second call must be a no-op, not a
 * failure. A caller that has to fail loudly (QUEUE-006 wants the stock restore
 * and the coupon return to roll back together) checks the flag and throws its
 * own error.
 *
 * A coupon whose window closed while it sat on the order comes back `expired`,
 * not `unused` — see `releaseUserCoupon` in the repo for why legacy got this
 * wrong.
 */
export async function release(tx: Tx, ctx: Ctx, input: ReleaseInput): Promise<ReleaseResult> {
  const { won } = await repo.releaseUserCoupon(tx, {
    id: input.userCouponId,
    now: ctx.clock.now(),
  });
  ctx.logger.info(
    { userCouponId: input.userCouponId, orderId: input.orderId, released: won },
    'coupon release',
  );
  return { released: won };
}

/**
 * Issue every active new-user coupon to a freshly registered account. Called
 * by E1 inside the registration transaction.
 *
 * Idempotent by "already holds one from this template", which is what makes a
 * retried registration issue nothing the second time (USER-002). Never throws:
 * a sold-out welcome coupon must not fail a registration.
 */
export async function grantNewUser(tx: Tx, ctx: Ctx, userId: number): Promise<number> {
  const now = ctx.clock.now();
  const templates = await repo.listIssuableByMode(tx, { mode: 'new_user', now });
  let granted = 0;
  for (const template of templates) {
    const held = await repo.nextClaimSlot(tx, { templateId: template.id, userId });
    if (held > 1) continue; // already has one from this template
    const outcome = await issueOne(tx, ctx, {
      template,
      userId,
      sourceKind: 'gift_new_user',
    });
    if (outcome.kind === 'issued') granted += 1;
    else
      ctx.logger.warn(
        { templateId: template.id, userId, why: outcome.kind },
        'new-user coupon not issued',
      );
  }
  return granted;
}

export interface OrderGiftInput {
  userId: number;
  orderId: number;
  /** Products in the paid order; `product_gift_coupons` maps them to templates. */
  productIds: readonly number[];
  /**
   * What the order actually paid. Required because `order_gift` templates carry
   * `gift_min_order_amount`, which cannot be evaluated without it — the brief's
   * sketch of this signature omitted it. See `docs/rewrite/status/golden.md`.
   */
  paidAmount: Money;
}

/**
 * Issue the gift coupons a paid order earns: the ones attached to the products
 * bought, plus every active `order_gift` template whose threshold the order
 * meets. Called from the order-paid effect handler.
 *
 * Idempotent through `user_coupons_order_gift_uq (source_order_id, template_id)
 * WHERE source_kind = 'gift_order'`, so replaying the payment callback issues
 * nothing more. Legacy had no such guard and double-granted on a repeated
 * callback (`StoreProductCouponServices::giveOrderProductCoupon`).
 *
 * Never throws: the order is already paid, and a coupon that could not be
 * issued is a support ticket, not a failed payment.
 */
export async function grantOrderGifts(
  tx: Tx,
  ctx: Ctx,
  input: OrderGiftInput,
): Promise<{ granted: number }> {
  const now = ctx.clock.now();
  const [fromProducts, fromOrderValue] = await Promise.all([
    repo.listProductGiftTemplates(tx, { productIds: input.productIds, now }),
    repo.listIssuableByMode(tx, { mode: 'order_gift', now }),
  ]);

  const candidates = new Map<number, repo.TemplateRow>();
  for (const template of fromProducts) candidates.set(template.id, template);
  for (const template of fromOrderValue) {
    const threshold = template.giftMinOrderAmount;
    if (threshold !== null && input.paidAmount.lt(Money.parse(threshold))) continue;
    candidates.set(template.id, template);
  }

  let granted = 0;
  for (const template of candidates.values()) {
    const outcome = await issueOne(tx, ctx, {
      template,
      userId: input.userId,
      sourceKind: 'gift_order',
      sourceOrderId: input.orderId,
    });
    if (outcome.kind === 'issued') granted += 1;
    else {
      ctx.logger.info(
        { templateId: template.id, orderId: input.orderId, why: outcome.kind },
        'order gift coupon not issued',
      );
    }
  }
  return { granted };
}

// ---------------------------------------------------------------------------
// issuing — the one place a user_coupons row is created
// ---------------------------------------------------------------------------

type IssueOutcome =
  | { kind: 'issued'; coupon: repo.UserCouponRow; remainingCount: number | null }
  | { kind: 'limit-reached' }
  | { kind: 'sold-out' };

/**
 * Put one coupon in a wallet. Every path — claim, admin grant, new-user gift,
 * order gift — comes through here, so the per-user limit and the supply are
 * enforced once.
 *
 * **Order matters.** The insert happens *before* the supply is decremented:
 *
 *  - insert first, and a per-user-limit loser (its `claim_slot` already taken)
 *    is refused without having consumed a coupon from the supply;
 *  - decrement second, and its loser gives the inserted row straight back,
 *    inside the same transaction.
 *
 * The reverse order leaks supply on every concurrent double-claim by one user.
 * COUPON-008 is the test that pins this down.
 */
async function issueOne(
  tx: Tx,
  ctx: Ctx,
  input: {
    template: repo.TemplateRow;
    userId: number;
    sourceKind: 'claim' | 'gift_order' | 'gift_new_user' | 'admin_grant';
    sourceOrderId?: number;
  },
): Promise<IssueOutcome> {
  const { template, userId } = input;
  const now = ctx.clock.now();

  const slot = await repo.nextClaimSlot(tx, { templateId: template.id, userId });
  if (template.perUserLimit !== null && slot > template.perUserLimit) {
    return { kind: 'limit-reached' };
  }

  const window = windowForIssue(template, now);
  const coupon = await repo.insertUserCoupon(tx, {
    templateId: template.id,
    userId,
    claimSlot: slot,
    sourceKind: input.sourceKind,
    ...(input.sourceOrderId === undefined ? {} : { sourceOrderId: input.sourceOrderId }),
    title: template.name,
    discountAmount: template.discountAmount,
    minSpend: template.minSpend,
    status: 'unused',
    validFrom: window.from,
    validTo: window.to,
    createdAt: now,
    updatedAt: now,
  });
  // `null` means a unique index refused it: another claim took this slot, or
  // this order already earned this gift. Both mean "nothing more to issue".
  if (!coupon) return { kind: 'limit-reached' };

  if (template.isUnlimitedSupply) return { kind: 'issued', coupon, remainingCount: null };

  const { won } = await repo.takeOneFromSupply(tx, { templateId: template.id, now });
  if (!won) {
    // The row above must not survive a supply that turned out to be empty.
    // `claim` and `adminGrant` throw, which would roll it back anyway, but
    // `grantNewUser` and `grantOrderGifts` deliberately do not — a sold-out
    // welcome coupon must not fail a registration — so `issueOne` undoes its
    // own insert rather than relying on how the caller reacts.
    await repo.deleteUserCoupon(tx, coupon.id);
    return { kind: 'sold-out' };
  }
  return { kind: 'issued', coupon, remainingCount: (template.remainingCount ?? 1) - 1 };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The form carries ids as decimal strings; the columns are bigints. */
function scopeLinksOf(body: CouponTemplateForm): { productIds: number[]; categoryIds: number[] } {
  return {
    productIds: body.productIds.map(Number),
    categoryIds: body.categoryIds.map(Number),
  };
}

function pageBounds(query: PageQuery): { offset: number; limit: number } {
  return { offset: (query.page - 1) * query.pageSize, limit: query.pageSize };
}

/** `status=a&status=b` reaches the service as an array; one value as a scalar. */
function asArray<T extends string>(value: T | readonly T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? [...value] : [value as T];
}

/** A template whose rows vanished (soft-deleted mid-page) degrades to "applies to everything". */
function termsOf(terms: Map<number, repo.TemplateTerms>, templateId: number): repo.TemplateTerms {
  return terms.get(templateId) ?? { scope: 'all_products', productIds: [], categoryIds: [] };
}

/** The wallet row supplies the money, the template supplies the applicability. */
function couponTerms(row: repo.UserCouponRow, applicability: repo.TemplateTerms): CouponTerms {
  return {
    scope: applicability.scope,
    productIds: applicability.productIds,
    categoryIds: applicability.categoryIds,
    discountAmount: Money.parse(row.discountAmount),
    minSpend: Money.parse(row.minSpend),
  };
}

/** Adds the caller's own claim state to a list of templates. `null` for an anonymous caller. */
async function withCallerState(
  ctx: Ctx,
  rows: readonly repo.TemplateRow[],
): Promise<ClaimableCoupon[]> {
  const userId = ctx.actor.kind === 'user' || ctx.actor.kind === 'staff' ? ctx.actor.id : null;
  const held = new Map<number, number>();
  if (userId !== null) {
    for (const row of rows) {
      held.set(row.id, (await repo.nextClaimSlot(ctx.db, { templateId: row.id, userId })) - 1);
    }
  }
  return rows.map((row) => {
    const claimedCount = userId === null ? null : (held.get(row.id) ?? 0);
    return {
      templateId: String(row.id),
      name: row.name,
      discountAmount: row.discountAmount,
      minSpend: row.minSpend,
      scope: row.scope,
      validityMode: row.validityMode,
      validFrom: iso(row.validFrom),
      validTo: iso(row.validTo),
      validDays: row.validDays,
      claimTo: iso(row.claimTo),
      isUnlimitedSupply: row.isUnlimitedSupply,
      remainingCount: row.remainingCount,
      perUserLimit: row.perUserLimit,
      claimedCount,
      canClaim:
        claimedCount === null
          ? null
          : row.claimMode === 'manual' &&
            (row.perUserLimit === null || claimedCount < row.perUserLimit),
    };
  });
}

// ---------------------------------------------------------------------------
// row -> wire
// ---------------------------------------------------------------------------

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toListItem(row: repo.TemplateRow, issuedCount: number): CouponTemplateListItem {
  return {
    id: String(row.id),
    name: row.name,
    scope: row.scope,
    claimMode: row.claimMode,
    status: row.status,
    discountAmount: row.discountAmount,
    minSpend: row.minSpend,
    validityMode: row.validityMode,
    validFrom: iso(row.validFrom),
    validTo: iso(row.validTo),
    validDays: row.validDays,
    claimFrom: iso(row.claimFrom),
    claimTo: iso(row.claimTo),
    isUnlimitedSupply: row.isUnlimitedSupply,
    totalCount: row.totalCount,
    remainingCount: row.remainingCount,
    issuedCount,
    perUserLimit: row.perUserLimit,
    giftMinOrderAmount: row.giftMinOrderAmount,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The phone's slimmer row. See `staffCoupon` in the contract for what is left out and why. */
function toStaffCoupon(row: repo.TemplateRow): StaffCoupon {
  return {
    id: String(row.id),
    name: row.name,
    discountAmount: row.discountAmount,
    minSpend: row.minSpend,
    scope: row.scope,
    validityMode: row.validityMode,
    validFrom: iso(row.validFrom),
    validTo: iso(row.validTo),
    validDays: row.validDays,
    isUnlimitedSupply: row.isUnlimitedSupply,
    remainingCount: row.remainingCount,
    perUserLimit: row.perUserLimit,
  };
}

function toDetail(
  row: repo.TemplateRow,
  issuedCount: number,
  links: { productIds: readonly (number | string)[]; categoryIds: readonly (number | string)[] },
): CouponTemplateDetail {
  return {
    ...toListItem(row, issuedCount),
    productIds: links.productIds.map(String),
    categoryIds: links.categoryIds.map(String),
  };
}

function toUserCoupon(row: repo.UserCouponRow, applicability: repo.TemplateTerms): UserCoupon {
  return {
    id: String(row.id),
    templateId: String(row.templateId),
    title: row.title,
    discountAmount: row.discountAmount,
    minSpend: row.minSpend,
    scope: applicability.scope,
    status: row.status,
    sourceKind: row.sourceKind,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo.toISOString(),
    usedAt: iso(row.usedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Turns a validated form into the column values, with the shape rules already guaranteed by zod. */
function templateValues(body: CouponTemplateForm): repo.NewTemplateValues {
  const limited = !body.isUnlimitedSupply;
  return {
    name: body.name,
    scope: body.scope,
    claimMode: body.claimMode,
    status: body.status,
    discountAmount: body.discountAmount,
    minSpend: body.minSpend,
    validityMode: body.validityMode,
    validFrom: body.validFrom ? new Date(body.validFrom) : null,
    validTo: body.validTo ? new Date(body.validTo) : null,
    validDays: body.validDays ?? null,
    claimFrom: body.claimFrom ? new Date(body.claimFrom) : null,
    claimTo: body.claimTo ? new Date(body.claimTo) : null,
    isUnlimitedSupply: body.isUnlimitedSupply,
    totalCount: limited ? body.totalCount! : null,
    remainingCount: limited ? body.totalCount! : null,
    perUserLimit: body.perUserLimit ?? null,
    giftMinOrderAmount: body.giftMinOrderAmount ?? null,
    sortOrder: body.sortOrder,
  };
}

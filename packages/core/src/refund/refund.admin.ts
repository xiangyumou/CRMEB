import type { PageQuery } from '@shop/contracts/conventions';
import type {
  AdminRefundDetail,
  AdminRefundListItem,
  AdminRefundListQuery,
  RefundApproveBody,
  RefundReceiveReturnBody,
  RefundRejectBody,
  RefundRemarkBody,
} from '@shop/contracts/refund/schemas';
import type { Tx } from '@shop/db';
import { requirePermission } from '../auth/rbac';
import { recordEffect } from '../effects';
import { requireAdminId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { toId, toIdOrNull } from '../kernel/ids';
import { notify } from '../notification';
import { refundPermissions } from './permissions';
import { returnAddress, type ReturnAddress } from './refund.config';
import * as repo from './refund.repo';
import {
  executeRefund,
  reconcileRefund,
  refreshOrderRefundStatus,
  returnDetail,
  toListItem,
  toLogEntry,
  type RefundItemWithSnapshot,
} from './refund.service';

/**
 * The after-sales console.
 *
 * Five decisions, and the split between the permission atoms is the split
 * between them: `request:review` says "this customer is owed money",
 * `request:execute` sends it. In a shop where customer service approves and
 * finance pays, that boundary is the control.
 *
 * No screen here sets an amount. The amount was computed from the frozen order
 * lines when the shopper applied, and re-pricing it afterwards is exactly the
 * defect REFUND-005 describes — so an operator's only choices are yes, no, the
 * goods came back, a note, and ask the gateway again.
 *
 * Approving does **not** send money. It records the decision and, for a
 * `refund_only`, an effect; the gateway call happens after that transaction has
 * committed, because an in-transaction refund would either give back money we
 * then rolled back or roll back a refund WeChat already made.
 */

export async function adminList(
  ctx: Ctx,
  query: AdminRefundListQuery,
): Promise<{ items: AdminRefundListItem[]; total: number; page: number; pageSize: number }> {
  requirePermission(ctx, refundPermissions['request:read']);
  return listRefunds(ctx, query);
}

async function listRefunds(
  ctx: Ctx,
  query: AdminRefundListQuery,
): Promise<{ items: AdminRefundListItem[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repo.listAdminRefunds(ctx.db, {
    ...optional('status', asArray(query.status)),
    ...optional('kind', query.kind),
    ...optional('returnStage', query.returnStage),
    ...optional('orderId', query.orderId === undefined ? undefined : Number(query.orderId)),
    ...optional('userId', query.userId === undefined ? undefined : Number(query.userId)),
    ...optional('keyword', query.keyword),
    ...optional('createdFrom', toDate(query.createdFrom)),
    ...optional('createdTo', toDate(query.createdTo)),
    sort: query.sortBy ?? 'id',
    order: query.sortOrder ?? 'desc',
    ...pageBounds(query),
  });

  const items = await repo.listItemsForRefunds(
    ctx.db,
    rows.map((r) => r.id),
  );
  return {
    items: rows.map((row) => toAdminItem(row, items.get(row.id) ?? [])),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function adminDetail(ctx: Ctx, input: { id: string }): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:read']);
  return detail(ctx, Number(input.id));
}

/**
 * 同意退款.
 *
 * A `refund_only` goes straight on to the gateway through the effects ledger; a
 * `return_and_refund` waits at `awaiting_shipment` until somebody confirms the
 * goods are back. Both moves are one conditional update from `applied`, so an
 * approval racing the buyer's withdrawal ends with exactly one winner.
 *
 * This is also the moment the return address stops being a setting and becomes
 * a fact. The operator's own address wins, the configured one is the fallback,
 * and whichever it is gets written to `refunds.return_address` — so editing
 * 售后设置 next month cannot re-address a parcel that is already in the post.
 * The config is read *before* the transaction opens, because it can touch Redis
 * and a row lock is being held inside.
 */
export async function adminApprove(
  ctx: Ctx,
  input: { id: string } & RefundApproveBody,
): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:review']);
  return approveAs(ctx, { kind: 'admin', id: requireAdminId(ctx) }, input);
}

/**
 * Who made a review decision.
 *
 * An operator is an `admins` row and is stamped on
 * `refunds.reviewed_by_admin_id`. The `staff` kind is what the mobile staff
 * console (deleted at the cutover) reviewed with: a `users` row, which that
 * column cannot hold, so such a decision was attributed on the log entry
 * (`operator_user_id`) alone. No caller passes it any more.
 * `reviewed_at` is set either way.
 */
type Reviewer = { kind: 'admin'; id: number } | { kind: 'staff'; id: number };

const reviewerStamp = (reviewer: Reviewer) => ({
  reviewedByAdminId: reviewer.kind === 'admin' ? reviewer.id : null,
});

const reviewerLog = (reviewer: Reviewer) =>
  reviewer.kind === 'admin' ? { operatorAdminId: reviewer.id } : { operatorUserId: reviewer.id };

async function approveAs(
  ctx: Ctx,
  reviewer: Reviewer,
  input: { id: string } & RefundApproveBody,
): Promise<AdminRefundDetail> {
  const id = Number(input.id);
  const address = input.returnAddress ?? (await returnAddress(ctx));

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row) throw new DomainError('REFUND_NOT_FOUND');

    // Only a return needs an address, and only if one was never frozen: a
    // re-approval after 驳回 must not quietly move the parcel.
    const freeze =
      row.kind === 'return_and_refund' && row.returnAddress === null && address !== null
        ? { returnAddress: address }
        : {};

    const { won } = await repo.transitionRefund(tx, id, ['applied'], 'approved', {
      ...reviewerStamp(reviewer),
      reviewedAt: ctx.clock.now(),
      ...freeze,
      ...(input.remark === undefined ? {} : { adminRemark: input.remark }),
    });
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });

    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: 'approved',
      message: approvalMessage(row.kind, input.remark, freeze.returnAddress ?? null, reviewer),
      ...reviewerLog(reviewer),
    });

    if (row.kind === 'refund_only') {
      await reserveUnits(tx, id, row.orderId);
      await queueExecution(tx, ctx, id);
    }

    // Last, so that an approval `reserveUnits` rolls back — the units went out
    // of the door first and the request is now a return — never tells the buyer
    // their refund was agreed.
    await notifyReview(tx, ctx, row, 'refund_approved', { amount: row.amount });
  });

  return detail(ctx, id);
}

/**
 * The buyer's half of a review decision.
 *
 * `orderNo` is what the templates show — a shopper knows their order number,
 * not the refund's internal order id — and it is not on the refund row, so it
 * costs one read inside the transaction that already holds the lock.
 */
async function notifyReview(
  tx: Tx,
  ctx: Ctx,
  row: repo.RefundRow,
  event: 'refund_approved' | 'refund_rejected',
  extra: Record<string, unknown>,
): Promise<void> {
  const order = await repo.findOrder(tx, row.orderId);
  await notify(tx, ctx, {
    event,
    // The refund, not the order: one order can be refunded line by line, and
    // each request gets its own answer.
    subject: { scope: 'refund', id: row.id },
    userId: row.userId,
    data: {
      refundId: row.id,
      refundNo: row.refundNo,
      orderNo: order?.orderNo ?? '',
      ...extra,
    },
  });
}

/**
 * Approving a 仅退款 takes its units out of fulfilment there and then.
 *
 * The warehouse must not ship goods an operator has just agreed to refund, and
 * fulfilment's dispatch guard reads `quantity - refunded_quantity`, so the only
 * way to stop it is to raise that column now rather than when the money lands.
 * The statement carries the mirror of fulfilment's own bound
 * (`refunded + q <= quantity - shipped_quantity`) for a line that has not
 * shipped, so an approval racing a dispatch of the same units has exactly one
 * winner whichever commits first. A line that already shipped is a money-only
 * refund of goods the buyer keeps; there is nothing left to race for, and the
 * ceiling is the whole line.
 *
 * Losing means the units went out of the door first. The approval rolls back
 * and the operator is told, which is right: the request is now a return, not a
 * refund.
 */
async function reserveUnits(tx: Tx, refundId: number, orderId: number): Promise<void> {
  const lines = await repo.listRefundItems(tx, refundId);
  const items = new Map(
    (await repo.listOrderItems(tx, orderId)).map((item) => [item.id, item] as const),
  );
  for (const line of lines) {
    const item = items.get(line.orderItemId);
    const bound = item !== undefined && item.shippedQuantity === 0 ? 'unshipped' : 'whole-line';
    const { won } = await repo.recomputeItemRefundedQuantity(tx, line.orderItemId, bound);
    if (!won) {
      throw new DomainError('REFUND_LINE_ALREADY_SHIPPED', {
        details: { orderItemId: toId(line.orderItemId) },
      });
    }
  }
}

/**
 * The timeline entry says where the goods were asked to go, so the audit trail
 * stands on its own even if somebody later edits the row.
 */
function approvalMessage(
  kind: repo.RefundRow['kind'],
  remark: string | undefined,
  address: ReturnAddress | null,
  reviewer: Reviewer,
): string {
  const who = reviewer.kind === 'admin' ? '商家' : '店员';
  const head = kind === 'return_and_refund' ? `${who}同意退货退款` : `${who}同意退款`;
  const note = remark === undefined ? '' : `：${remark}`;
  const where =
    address === null ? '' : `（退货地址：${address.name} ${address.phone} ${address.address}）`;
  return `${head}${note}${where}`.slice(0, 500);
}

export async function adminReject(
  ctx: Ctx,
  input: { id: string } & RefundRejectBody,
): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:review']);
  return rejectAs(ctx, { kind: 'admin', id: requireAdminId(ctx) }, input);
}

async function rejectAs(
  ctx: Ctx,
  reviewer: Reviewer,
  input: { id: string } & RefundRejectBody,
): Promise<AdminRefundDetail> {
  const id = Number(input.id);

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row) throw new DomainError('REFUND_NOT_FOUND');

    // `refunds_rejected_needs_reason` makes the reason a database rule; the
    // contract makes it a required field. Both, because a rejection nobody can
    // explain later is the complaint that reaches the shop owner.
    const { won } = await repo.transitionRefund(tx, id, ['applied', 'approved'], 'rejected', {
      ...reviewerStamp(reviewer),
      reviewedAt: ctx.clock.now(),
      rejectReason: input.rejectReason,
    });
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });

    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: 'rejected',
      message: `${reviewer.kind === 'admin' ? '商家' : '店员'}拒绝：${input.rejectReason}`,
      ...reviewerLog(reviewer),
    });
    await refreshOrderRefundStatus(tx, row.orderId);

    // The reason travels with it: a rejection the buyer cannot explain later is
    // the complaint that reaches the shop owner, and the database makes the
    // reason mandatory for the same reason.
    await notifyReview(tx, ctx, row, 'refund_rejected', { reason: input.rejectReason });
  });

  return detail(ctx, id);
}

/**
 * 确认收货并退款.
 *
 * Moves `approved → processing` and queues the gateway call. `processing` is
 * persisted *before* anything is sent, so a crash between the commit and the
 * call leaves a row the sweep will finish rather than a refund nobody knows
 * about.
 */
export async function adminReceiveReturn(
  ctx: Ctx,
  input: { id: string } & RefundReceiveReturnBody,
): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:execute']);
  const adminId = requireAdminId(ctx);
  const id = Number(input.id);

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row) throw new DomainError('REFUND_NOT_FOUND');
    if (row.kind !== 'return_and_refund') throw new DomainError('REFUND_RETURN_NOT_EXPECTED');

    const { won } = await repo.transitionRefund(tx, id, ['approved'], 'processing', {
      returnStage: 'received',
      ...(input.remark === undefined ? {} : { adminRemark: input.remark }),
    });
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });

    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: 'processing',
      message:
        input.remark === undefined ? '商家确认收到退货' : `商家确认收到退货：${input.remark}`,
      operatorAdminId: adminId,
    });
    await queueExecution(tx, ctx, id);
  });

  return detail(ctx, id);
}

export async function adminRemark(
  ctx: Ctx,
  input: { id: string } & RefundRemarkBody,
): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:write']);
  const id = Number(input.id);
  const row = await repo.findRefund(ctx.db, id);
  if (!row) throw new DomainError('REFUND_NOT_FOUND');
  await repo.setAdminRemark(ctx.db, id, input.adminRemark);
  return detail(ctx, id);
}

/**
 * 复核退款结果.
 *
 * Two different buttons behind one route, and which one runs is decided by the
 * row rather than by the operator: a refund that may be in flight is *queried*
 * by its frozen number, and one the gateway never took is *sent* again under
 * that same number. Nothing here ever mints a second refund number, which is
 * what makes this safe to press twice (REFUND-005 / REFUND-006).
 */
export async function adminRetry(ctx: Ctx, input: { id: string }): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:execute']);
  const id = Number(input.id);
  const row = await repo.findRefund(ctx.db, id);
  if (!row) throw new DomainError('REFUND_NOT_FOUND');

  if (row.status === 'succeeded') return detail(ctx, id);
  if (row.status === 'processing' || row.status === 'unknown') {
    const result = await reconcileRefund(ctx, id);
    if (result.status === 'unknown') {
      throw new DomainError('REFUND_STATE_UNKNOWN', { details: { message: result.message } });
    }
    return detail(ctx, id);
  }
  if (row.status === 'approved' || row.status === 'failed') {
    await executeRefund(ctx, id);
    return detail(ctx, id);
  }
  throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });
}

// ---------------------------------------------------------------------------

/**
 * Records the "send this to WeChat" effect inside the caller's transaction.
 *
 * One row per refund, so an operator pressing 同意 twice queues one call; the
 * ledger's `(scope, scopeId, eventType)` uniqueness does that, not a check
 * here.
 */
async function queueExecution(tx: Tx, ctx: Ctx, refundId: number): Promise<void> {
  await recordEffect(tx, ctx, {
    scope: 'refund',
    scopeId: String(refundId),
    eventType: 'refund.execute',
    payload: { refundId: toId(refundId) },
  });
}

async function detail(ctx: Ctx, id: number): Promise<AdminRefundDetail> {
  const row = await repo.findAdminRefund(ctx.db, id);
  if (!row) throw new DomainError('REFUND_NOT_FOUND');
  const [items, logs, company] = await Promise.all([
    repo.listItemsForRefunds(ctx.db, [row.id]),
    repo.listLogs(ctx.db, row.id),
    row.returnExpressCompanyId === null
      ? Promise.resolve(null)
      : repo.findExpressCompany(ctx.db, row.returnExpressCompanyId),
  ]);
  const returns = returnDetail(row, company);

  return {
    ...toAdminItem(row, items.get(row.id) ?? []),
    explanation: returns.explanation,
    images: returns.images,
    returnExpressCompanyId: returns.returnExpressCompanyId,
    returnExpressCompanyName: returns.returnExpressCompanyName,
    returnTrackingNo: returns.returnTrackingNo,
    returnPhone: returns.returnPhone,
    returnAddress: returns.returnAddress,
    logs: logs.map(toLogEntry),
  };
}

function toAdminItem(
  row: repo.RefundListRow,
  items: RefundItemWithSnapshot[],
): AdminRefundListItem {
  return {
    ...toListItem(row, items),
    userId: toId(row.userId),
    userNickname: row.userNickname,
    outRefundNo: row.outRefundNo,
    gatewayRefundId: row.gatewayRefundId,
    paymentAttemptId: toIdOrNull(row.paymentAttemptId),
    isAutomatic: row.isAutomatic,
    adminRemark: row.adminRemark,
    lastError: row.lastError,
    reviewedByAdminId: toIdOrNull(row.reviewedByAdminId),
    reviewedAt: iso(row.reviewedAt),
    failedAt: iso(row.failedAt),
    cancelledAt: iso(row.cancelledAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function pageBounds(query: PageQuery): { offset: number; limit: number } {
  return { offset: (query.page - 1) * query.pageSize, limit: query.pageSize };
}
function asArray<T extends string>(value: T | readonly T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? [...value] : [value as T];
}
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
function toDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed);
}
function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

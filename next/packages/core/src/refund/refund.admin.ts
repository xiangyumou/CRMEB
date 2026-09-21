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
import { refundPermissions } from './permissions';
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
 */
export async function adminApprove(
  ctx: Ctx,
  input: { id: string } & RefundApproveBody,
): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:review']);
  const adminId = requireAdminId(ctx);
  const id = Number(input.id);

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row) throw new DomainError('REFUND_NOT_FOUND');

    const { won } = await repo.transitionRefund(tx, id, ['applied'], 'approved', {
      reviewedByAdminId: adminId,
      reviewedAt: ctx.clock.now(),
      ...(input.remark === undefined ? {} : { adminRemark: input.remark }),
    });
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });

    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: 'approved',
      message: approvalMessage(row.kind, input),
      operatorAdminId: adminId,
    });

    if (row.kind === 'refund_only') await queueExecution(tx, ctx, id);
  });

  return detail(ctx, id);
}

/**
 * The per-request return address has nowhere to live on the row yet, so it is
 * written into the timeline, where an operator and the buyer can both read it.
 * `CR-5-c` asks for `refunds.return_address`; until then the address the buyer's
 * detail shows is the shop's configured one.
 */
function approvalMessage(kind: repo.RefundRow['kind'], input: RefundApproveBody): string {
  const head = kind === 'return_and_refund' ? '商家同意退货退款' : '商家同意退款';
  const remark = input.remark === undefined ? '' : `：${input.remark}`;
  const address =
    input.returnAddress === undefined
      ? ''
      : `（退货地址：${input.returnAddress.name} ${input.returnAddress.phone} ${input.returnAddress.address}）`;
  return `${head}${remark}${address}`.slice(0, 500);
}

export async function adminReject(
  ctx: Ctx,
  input: { id: string } & RefundRejectBody,
): Promise<AdminRefundDetail> {
  requirePermission(ctx, refundPermissions['request:review']);
  const adminId = requireAdminId(ctx);
  const id = Number(input.id);

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row) throw new DomainError('REFUND_NOT_FOUND');

    // `refunds_rejected_needs_reason` makes the reason a database rule; the
    // contract makes it a required field. Both, because a rejection nobody can
    // explain later is the complaint that reaches the shop owner.
    const { won } = await repo.transitionRefund(tx, id, ['applied', 'approved'], 'rejected', {
      reviewedByAdminId: adminId,
      reviewedAt: ctx.clock.now(),
      rejectReason: input.rejectReason,
    });
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });

    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: 'rejected',
      message: `商家拒绝：${input.rejectReason}`,
      operatorAdminId: adminId,
    });
    await refreshOrderRefundStatus(tx, row.orderId);
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
  const returns = await returnDetail(ctx, row, company);

  return {
    ...toAdminItem(row, items.get(row.id) ?? []),
    explanation: returns.explanation,
    images: returns.images,
    returnExpressCompanyId: returns.returnExpressCompanyId,
    returnExpressCompanyName: returns.returnExpressCompanyName,
    returnTrackingNo: returns.returnTrackingNo,
    returnPhone: returns.returnPhone,
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

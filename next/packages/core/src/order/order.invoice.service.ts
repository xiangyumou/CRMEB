import type {
  AdminInvoiceListQuery,
  InvoiceIssueBody,
  InvoiceOrderSummary,
  InvoiceRejectBody,
  InvoiceRequestBody,
  MyInvoiceListQuery,
  OrderInvoice,
} from '@shop/contracts/order/order.fulfil.schemas';
import { requireAdminId, requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId } from '../kernel/ids';
import * as fulfilRepo from './order.fulfil.repo';
import { requireOrderRef } from './order.ref';
import * as repo from './order.repo';

/**
 * 发票.
 *
 * Legacy's `store_order_invoice` was a second copy of the order — it carried
 * `order_id`, `pay_price`, the address, the items — and the two drifted the
 * moment anything was refunded. Here the row carries only the *header* (who the
 * invoice is made out to, frozen at request time) plus the amount, and
 * everything else is read from the order.
 *
 * Three rules, all enforced by the database rather than by a prior SELECT:
 *
 *  1. **One live request per order.** `order_invoices_open_uq` is a partial
 *     unique index over `status in ('requested','issued')`, so a double-tap on
 *     申请开票 raises a constraint violation that becomes
 *     `ORDER_INVOICE_ALREADY_OPEN`. A cancelled or rejected request may be
 *     re-submitted, which the partial index allows and a plain unique would
 *     not.
 *  2. **Issued means numbered.** `order_invoices_issued_shape` requires
 *     `issued_at` and `invoice_number` together, so there is no such thing as
 *     an issued invoice nobody can look up.
 *  3. **Every status change is a conditional update.** Two operators pressing
 *     开票 and 驳回 at the same instant cannot both win.
 *
 * The e-invoice provider integration stays out of scope (the brief); an
 * operator types the number from whatever system actually issued it.
 */

// ---------------------------------------------------------------------------
// wire mapping
// ---------------------------------------------------------------------------

type InvoiceRow = fulfilRepo.OrderInvoiceRow & { orderNo: string };

/**
 * What the order was for, for the 发票记录 row (CR-4-h §7).
 *
 * Read from `order_items` every time rather than copied onto the invoice: the
 * invoice row carries the header and the amount, and nothing that could drift
 * away from the order it points at. One query covers a whole page of invoices.
 */
async function summarise(
  ctx: Ctx,
  orderIds: readonly number[],
): Promise<Map<number, InvoiceOrderSummary>> {
  const out = new Map<number, InvoiceOrderSummary>();
  if (orderIds.length === 0) return out;

  // `listItems` orders by id, so the first row of each order is the line the
  // buyer added first — the same one the order list renders.
  for (const item of await repo.listItems(ctx.db, orderIds)) {
    const seen = out.get(item.orderId);
    if (seen) {
      seen.lineCount += 1;
      seen.totalQuantity += item.quantity;
      continue;
    }
    out.set(item.orderId, {
      productName: item.snapshot.productName,
      productImageUrl: item.snapshot.skuImageUrl ?? item.snapshot.productImageUrl,
      specText: item.snapshot.specText,
      quantity: item.quantity,
      lineCount: 1,
      totalQuantity: item.quantity,
    });
  }
  return out;
}

function toWire(row: InvoiceRow, orderSummary: InvoiceOrderSummary | null): OrderInvoice {
  return {
    id: toId(row.id),
    orderId: toId(row.orderId),
    orderNo: row.orderNo,
    userId: toId(row.userId),
    status: row.status,
    headerType: row.headerType,
    invoiceType: row.invoiceType,
    name: row.name,
    dutyNumber: row.dutyNumber,
    drawerPhone: row.drawerPhone,
    email: row.email,
    registeredTel: row.registeredTel,
    registeredAddress: row.registeredAddress,
    bankName: row.bankName,
    bankAccount: row.bankAccount,
    amount: row.amount,
    invoiceNumber: row.invoiceNumber,
    remark: row.remark,
    orderSummary,
    issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function readInvoice(ctx: Ctx, id: number): Promise<OrderInvoice> {
  const row = await fulfilRepo.findInvoiceWithOrderNo(ctx.db, id);
  if (!row) throw new DomainError('ORDER_INVOICE_NOT_FOUND');
  const [wired] = await withSummaries(ctx, [row]);
  return wired!;
}

/** One `order_items` read behind a whole page of invoices. */
async function withSummaries(ctx: Ctx, rows: readonly InvoiceRow[]): Promise<OrderInvoice[]> {
  const summaries = await summarise(
    ctx,
    rows.map((row) => row.orderId),
  );
  return rows.map((row) => toWire(row, summaries.get(row.orderId) ?? null));
}

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value as T];

const asDate = (value: string | undefined): Date | undefined =>
  value === undefined ? undefined : new Date(value);

// ---------------------------------------------------------------------------
// the buyer
// ---------------------------------------------------------------------------

/**
 * 申请开票.
 *
 * Only on an order that has been paid for and not refunded: an invoice for
 * money that came back is a tax problem, and an invoice for money that never
 * arrived is a different one.
 */
export async function request(
  ctx: Ctx,
  params: { id: string },
  body: InvoiceRequestBody,
): Promise<OrderInvoice> {
  const { orderId, userId } = await requireOrderRef(ctx, params.id);

  const invoiceId = await ctx.withTx(async (tx): Promise<number> => {
    const order = await repo.findOrderForUser(tx, { id: orderId, userId });
    if (!order) throw new DomainError('ORDER_NOT_FOUND');
    if (
      order.paidAt === null ||
      order.paidAmount === null ||
      order.status === 'refunded' ||
      order.refundStatus === 'refunded'
    ) {
      throw new DomainError('ORDER_INVOICE_NOT_REQUESTABLE', {
        details: { status: order.status, refundStatus: order.refundStatus },
      });
    }

    try {
      const invoice = await fulfilRepo.insertInvoice(tx, {
        orderId,
        userId,
        status: 'requested',
        headerType: body.headerType,
        invoiceType: body.invoiceType,
        name: body.name,
        dutyNumber: body.dutyNumber ?? null,
        drawerPhone: body.drawerPhone ?? null,
        email: body.email ?? null,
        registeredTel: body.registeredTel ?? null,
        registeredAddress: body.registeredAddress ?? null,
        bankName: body.bankName ?? null,
        bankAccount: body.bankAccount ?? null,
        // What the buyer actually paid, less anything already refunded.
        amount: order.paidAmount,
        remark: body.remark ?? null,
      });

      await repo.insertStatusLog(tx, {
        orderId,
        changeType: 'invoice_requested',
        message: `申请开票 ${body.name}`.slice(0, 512),
        operatorKind: 'user',
        operatorUserId: userId,
      });
      return invoice.id;
    } catch (error) {
      // The partial unique index is the check. Asking first would be a
      // read-then-write with a race in the gap.
      if (fulfilRepo.isOpenInvoiceConflict(error)) {
        throw new DomainError('ORDER_INVOICE_ALREADY_OPEN');
      }
      throw error;
    }
  });

  return readInvoice(ctx, invoiceId);
}

export async function myList(
  ctx: Ctx,
  query: MyInvoiceListQuery,
): Promise<{ items: OrderInvoice[]; total: number; page: number; pageSize: number }> {
  const userId = requireUserId(ctx);
  const { rows, total } = await fulfilRepo.listInvoices(ctx.db, {
    filter: { userId, status: asArray(query.status) },
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });
  return {
    items: await withSummaries(ctx, rows),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function myDetail(ctx: Ctx, params: { id: string }): Promise<OrderInvoice> {
  const userId = requireUserId(ctx);
  const row = await fulfilRepo.findInvoiceWithOrderNo(ctx.db, fromId(params.id));
  // A stranger's invoice and a missing one are the same answer (AUTH-005).
  if (!row || row.userId !== userId) throw new DomainError('ORDER_INVOICE_NOT_FOUND');
  const [wired] = await withSummaries(ctx, [row]);
  return wired!;
}

/** The buyer withdraws a request that has not been issued yet. */
export async function cancel(ctx: Ctx, params: { id: string }): Promise<OrderInvoice> {
  const userId = requireUserId(ctx);
  const invoiceId = fromId(params.id);

  await ctx.withTx(async (tx) => {
    const row = await fulfilRepo.findInvoice(tx, invoiceId);
    if (!row || row.userId !== userId) throw new DomainError('ORDER_INVOICE_NOT_FOUND');
    const moved = await fulfilRepo.transitionInvoice(tx, {
      invoiceId,
      from: ['requested'],
      to: 'cancelled',
    });
    if (!moved.won) throw new DomainError('ORDER_INVOICE_NOT_ACTIONABLE');
  });

  return readInvoice(ctx, invoiceId);
}

// ---------------------------------------------------------------------------
// the operator
// ---------------------------------------------------------------------------

export async function adminList(
  ctx: Ctx,
  query: AdminInvoiceListQuery,
): Promise<{ items: OrderInvoice[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await fulfilRepo.listInvoices(ctx.db, {
    filter: {
      status: asArray(query.status),
      headerType: query.headerType,
      invoiceType: query.invoiceType,
      keyword: query.keyword,
      userId: query.userId === undefined ? undefined : fromId(query.userId),
      createdFrom: asDate(query.createdFrom),
      createdTo: asDate(query.createdTo),
    },
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });
  return {
    items: await withSummaries(ctx, rows),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function adminDetail(ctx: Ctx, params: { id: string }): Promise<OrderInvoice> {
  return readInvoice(ctx, fromId(params.id));
}

/** 开票. The number the operator types is what the buyer will quote back. */
export async function adminIssue(
  ctx: Ctx,
  params: { id: string },
  body: InvoiceIssueBody,
): Promise<OrderInvoice> {
  const adminId = requireAdminId(ctx);
  const invoiceId = fromId(params.id);
  const now = ctx.clock.now();

  await ctx.withTx(async (tx) => {
    const row = await fulfilRepo.findInvoice(tx, invoiceId);
    if (!row) throw new DomainError('ORDER_INVOICE_NOT_FOUND');

    const moved = await fulfilRepo.transitionInvoice(tx, {
      invoiceId,
      from: ['requested'],
      to: 'issued',
      set: {
        invoiceNumber: body.invoiceNumber,
        issuedAt: now,
        issuedByAdminId: adminId,
        ...(body.remark === undefined ? {} : { remark: body.remark }),
      },
    });
    if (!moved.won) throw new DomainError('ORDER_INVOICE_NOT_ACTIONABLE');

    await repo.insertStatusLog(tx, {
      orderId: row.orderId,
      changeType: 'invoice_issued',
      message: `开票 ${body.invoiceNumber}`.slice(0, 512),
      operatorKind: 'admin',
      operatorAdminId: adminId,
    });
  });

  return readInvoice(ctx, invoiceId);
}

/** 驳回. The reason is required — the buyer is told, and told why. */
export async function adminReject(
  ctx: Ctx,
  params: { id: string },
  body: InvoiceRejectBody,
): Promise<OrderInvoice> {
  const adminId = requireAdminId(ctx);
  const invoiceId = fromId(params.id);

  await ctx.withTx(async (tx) => {
    const row = await fulfilRepo.findInvoice(tx, invoiceId);
    if (!row) throw new DomainError('ORDER_INVOICE_NOT_FOUND');

    const moved = await fulfilRepo.transitionInvoice(tx, {
      invoiceId,
      from: ['requested'],
      to: 'rejected',
      set: { remark: body.reason },
    });
    if (!moved.won) throw new DomainError('ORDER_INVOICE_NOT_ACTIONABLE');

    await repo.insertStatusLog(tx, {
      orderId: row.orderId,
      changeType: 'invoice_rejected',
      message: `驳回开票: ${body.reason}`.slice(0, 512),
      operatorKind: 'admin',
      operatorAdminId: adminId,
    });
  });

  return readInvoice(ctx, invoiceId);
}

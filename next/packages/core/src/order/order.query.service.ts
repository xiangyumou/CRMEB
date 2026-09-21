import type {
  OrderCounts,
  OrderDetail,
  OrderItem,
  OrderListItem,
  OrderListQuery,
} from '@shop/contracts/order/schemas';
import { requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId, toIdOrNull } from '../kernel/ids';
import * as repo from './order.repo';

/**
 * The buyer's own orders: the list, the tab badges and one order's detail.
 *
 * The only thing worth reading twice is `tabFilter`. The storefront's tabs are
 * *not* `orders.status` values — 待收货 covers `shipped`, 已完成 covers both
 * `received` and `completed` — and that mapping is written here, once, so the
 * list and the badges can never disagree about what 待发货 means.
 */

export async function list(
  ctx: Ctx,
  query: OrderListQuery,
): Promise<{ items: OrderListItem[]; total: number; page: number; pageSize: number }> {
  const userId = requireUserId(ctx);
  const { rows, total } = await repo.listOrders(ctx.db, {
    userId,
    where: repo.tabFilter(query.tab),
    keyword: query.keyword,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });

  const items = await repo.listItems(
    ctx.db,
    rows.map((row) => row.id),
  );
  const byOrder = new Map<number, OrderItem[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId);
    const mapped = toOrderItem(item);
    if (list) list.push(mapped);
    else byOrder.set(item.orderId, [mapped]);
  }

  return {
    items: rows.map((row) => toListItem(row, byOrder.get(row.id) ?? [])),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * The seven badges from one grouped query.
 *
 * `refunding` counts orders with any live after-sales, so an order can be in
 * two badges at once — which is what the tab bar has always shown, because an
 * order being refunded is still 待收货 until the refund succeeds.
 */
export async function counts(ctx: Ctx): Promise<OrderCounts> {
  const userId = requireUserId(ctx);
  const rows = await repo.countByStatus(ctx.db, userId);

  const out: OrderCounts = {
    all: 0,
    unpaid: 0,
    unshipped: 0,
    unreceived: 0,
    finished: 0,
    cancelled: 0,
    refunding: 0,
  };
  for (const row of rows) {
    out.all += row.n;
    if (row.refunding) out.refunding += row.n;
    switch (row.status) {
      case 'pending_payment':
        out.unpaid += row.n;
        break;
      case 'paid':
        out.unshipped += row.n;
        break;
      case 'shipped':
        out.unreceived += row.n;
        break;
      case 'received':
      case 'completed':
        out.finished += row.n;
        break;
      case 'cancelled':
        out.cancelled += row.n;
        break;
      default:
        break;
    }
  }
  return out;
}

/** The route-facing detail. A stranger and an unknown id get the same 404. */
export async function detail(ctx: Ctx, params: { id: string }): Promise<OrderDetail> {
  const userId = requireUserId(ctx);
  return detailOf(ctx, { orderId: fromId(params.id), userId });
}

/** Used by `create` and `cancel` to answer with the order they just changed. */
export async function detailOf(
  ctx: Ctx,
  input: { orderId: number; userId: number },
): Promise<OrderDetail> {
  const row = await repo.findOrderForUser(ctx.db, { id: input.orderId, userId: input.userId });
  if (!row) throw new DomainError('ORDER_NOT_FOUND');
  const items = await repo.listItems(ctx.db, [row.id]);
  return toDetail(row, items.map(toOrderItem));
}

// ---------------------------------------------------------------------------
// row -> wire
// ---------------------------------------------------------------------------

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

function toOrderItem(row: repo.OrderItemRow): OrderItem {
  const snapshot = row.snapshot;
  return {
    id: toId(row.id),
    itemKey: row.itemKey,
    productId: toId(row.productId),
    skuId: toId(row.skuId),
    productName: snapshot.productName,
    productImageUrl: snapshot.productImageUrl,
    productKind: snapshot.productKind,
    specText: snapshot.specText,
    skuImageUrl: snapshot.skuImageUrl ?? null,
    unitName: snapshot.unitName ?? null,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    originalUnitPrice: row.originalUnitPrice,
    discountAmount: row.discountAmount,
    totalAmount: row.totalAmount,
    refundedQuantity: row.refundedQuantity,
    shippedQuantity: row.shippedQuantity,
  };
}

function toListItem(row: repo.OrderRow, items: OrderItem[]): OrderListItem {
  return {
    id: toId(row.id),
    orderNo: row.orderNo,
    kind: row.kind,
    status: row.status,
    fulfillmentStatus: row.fulfillmentStatus,
    refundStatus: row.refundStatus,
    totalQuantity: row.totalQuantity,
    itemsAmount: row.itemsAmount,
    freightAmount: row.freightAmount,
    couponDiscount: row.couponDiscount,
    payableAmount: row.payableAmount,
    paidAmount: row.paidAmount,
    // The countdown only exists while the order can still be paid.
    payExpiresAt: row.status === 'pending_payment' ? iso(row.payExpiresAt) : null,
    createdAt: row.createdAt.toISOString(),
    items,
  };
}

function toDetail(row: repo.OrderRow, items: OrderItem[]): OrderDetail {
  return {
    ...toListItem(row, items),
    receiver: {
      // The order carries a snapshot, not a link: editing the address book
      // later must never rewrite where an order was sent.
      addressId: null,
      name: row.receiverName,
      phone: row.receiverPhone,
      province: row.receiverProvince,
      city: row.receiverCity,
      district: row.receiverDistrict,
      detail: row.receiverDetail,
      postCode: row.receiverPostCode,
    },
    buyerRemark: row.buyerRemark,
    customForm: row.customForm,
    userCouponId: toIdOrNull(row.userCouponId),
    paidAt: iso(row.paidAt),
    shippedAt: iso(row.shippedAt),
    receivedAt: iso(row.receivedAt),
    completedAt: iso(row.completedAt),
    cancelledAt: iso(row.cancelledAt),
    cancelReason: row.cancelReason,
  };
}

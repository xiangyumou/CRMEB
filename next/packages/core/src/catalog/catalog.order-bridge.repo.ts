import { productReviews } from '@shop/db/schema/catalog';
import { orderItems, orders } from '@shop/db/schema/order';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

import { registerOrderFacts, type OrderFactsPort, type ReviewableLine } from '../order/ports';

/**
 * **Temporary.** The only file in this stream that reads another domain's
 * tables, and the only reason it is allowed to is that it exists to be deleted.
 *
 * `CR-2-a` asked for the seam and got it: `OrderFactsPort` now lives in
 * `core/src/order/ports.ts` beside `StockPort`. What is still missing is an
 * *implementation* — the order domain registers none yet — so this file stays
 * as the stand-in that keeps the review routes, the purchase limit and the
 * auto-review job working end to end. The orchestrator moves it into the order
 * domain at merge; the moment anything calls `registerOrderFacts()` later in
 * the import order, this registration is replaced and nothing else changes.
 *
 * Everything here is a read. Nothing in this stream writes an order row.
 */

const REVIEWABLE_STATUSES = ['received', 'completed'] as const;

/** `snapshot` carries the variant label the buyer actually saw. */
interface OrderItemSnapshotShape {
  specText?: string;
}

function specTextOf(snapshot: unknown): string {
  if (typeof snapshot === 'object' && snapshot !== null) {
    const text = (snapshot as OrderItemSnapshotShape).specText;
    if (typeof text === 'string') return text;
  }
  return '';
}

export const orderBridge: OrderFactsPort = {
  async findReviewableLine(tx, args): Promise<ReviewableLine | null> {
    const rows = await tx
      .select({
        orderId: orders.id,
        orderItemId: orderItems.id,
        productId: orderItems.productId,
        skuId: orderItems.skuId,
        snapshot: orderItems.snapshot,
        userId: orders.userId,
        quantity: orderItems.quantity,
        refundedQuantity: orderItems.refundedQuantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.id, args.orderItemId),
          // Ownership is part of the WHERE, not an `if` afterwards: a stranger
          // gets the same `null` as a missing line.
          eq(orders.userId, args.userId),
          sql`${orders.status} in ('received', 'completed')`,
          // A line refunded in full was never really received.
          sql`${orderItems.refundedQuantity} < ${orderItems.quantity}`,
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      orderId: row.orderId,
      orderItemId: row.orderItemId,
      productId: row.productId,
      skuId: row.skuId,
      specText: specTextOf(row.snapshot),
      userId: row.userId,
    };
  },

  async purchasedQuantity(tx, args): Promise<number> {
    const rows = await tx
      .select({
        // Refunded units do not count against a lifetime limit: the shopper
        // does not have the goods.
        total: sql<number>`coalesce(sum(${orderItems.quantity} - ${orderItems.refundedQuantity}), 0)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.productId, args.productId),
          eq(orders.userId, args.userId),
          sql`${orders.status} in ('paid', 'shipped', 'received', 'completed')`,
        ),
      );
    return rows[0]?.total ?? 0;
  },

  async findLinesAwaitingReview(tx, args): Promise<ReviewableLine[]> {
    const rows = await tx
      .select({
        orderId: orders.id,
        orderItemId: orderItems.id,
        productId: orderItems.productId,
        skuId: orderItems.skuId,
        snapshot: orderItems.snapshot,
        userId: orders.userId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(productReviews, eq(productReviews.orderItemId, orderItems.id))
      .where(
        and(
          eq(orders.status, 'completed'),
          lte(orders.updatedAt, args.completedBefore),
          isNull(productReviews.id),
          sql`${orderItems.refundedQuantity} < ${orderItems.quantity}`,
        ),
      )
      .orderBy(asc(orderItems.id))
      .limit(args.limit);

    return rows.map((row) => ({
      orderId: row.orderId,
      orderItemId: row.orderItemId,
      productId: row.productId,
      skuId: row.skuId,
      specText: specTextOf(row.snapshot),
      userId: row.userId,
    }));
  },

  async hasOpenOrders(tx, productId): Promise<boolean> {
    const rows = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.productId, productId),
          sql`${orders.status} in ('pending_payment', 'paid', 'shipped', 'received')`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  },
};

registerOrderFacts(orderBridge);

export { REVIEWABLE_STATUSES };

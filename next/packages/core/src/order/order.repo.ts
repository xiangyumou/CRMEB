import { createHash } from 'node:crypto';
import type { DbOrTx, Tx } from '@shop/db';
import { cartItems } from '@shop/db/schema/cart';
import { orderItems, orderStatusLogs, orders } from '@shop/db/schema/order';
import { effects } from '@shop/db/schema/system';
import { userAddresses } from '@shop/db/schema/user';
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  allOf,
  conditionalDelete,
  conditionalUpdate,
  type ConditionalUpdateResult,
} from '../kernel/tx';
import type { OrderListTab } from '@shop/contracts/order/schemas';
import type { OrderStatus } from './ports';

/**
 * The only file in the order domain that touches Drizzle tables.
 *
 * Statements, not decisions: every `if` about an affected row count lives in a
 * service. The two things worth reading closely are `transitionStatus` (one
 * guarded UPDATE, the whole state machine) and the idempotency trio at the
 * bottom, which is how a double submit is stopped by the database rather than
 * by a cache lock.
 */

/** Re-exported so a service can type a snapshot without importing the schema. */
export type { OrderItemSnapshot } from '@shop/db/schema/order';

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderValues = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type NewOrderItemValues = typeof orderItems.$inferInsert;
export type AddressRow = typeof userAddresses.$inferSelect;

/** Visible to its owner: not hidden by the buyer, not soft-deleted by an operator. */
const liveForUser = (): SQL | undefined =>
  and(isNull(orders.hiddenByUserAt), isNull(orders.deletedAt));

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export async function findOrder(db: DbOrTx, id: number): Promise<OrderRow | null> {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * A stranger and an unknown id are the same answer, deliberately: telling the
 * caller "this order exists but is not yours" is an enumeration oracle
 * (AUTH-005).
 */
export async function findOrderForUser(
  db: DbOrTx,
  args: { id: number; userId: number },
): Promise<OrderRow | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, args.id), eq(orders.userId, args.userId), liveForUser()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * `SELECT … FOR UPDATE` on the order row.
 *
 * Cancellation needs it because it spans several rows that must agree — the
 * order, its coupon, its stock — and because `PaymentPort.ensureNoOpenAttempts`
 * is asked *while holding it*, so a payment cannot start underneath a
 * cancellation (risk matrix §4, "shared order lock").
 */
export async function lockOrder(tx: Tx, id: number): Promise<OrderRow | null> {
  const rows = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update');
  return rows[0] ?? null;
}

export async function statusOf(db: DbOrTx, id: number): Promise<OrderStatus | null> {
  const rows = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id));
  const status = rows[0]?.status;
  return status === undefined ? null : status;
}

export async function listItems(db: DbOrTx, orderIds: readonly number[]): Promise<OrderItemRow[]> {
  if (orderIds.length === 0) return [];
  return db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, [...new Set(orderIds)]))
    .orderBy(asc(orderItems.id));
}

/** What the `StockPort` has to give back on a cancellation. */
export async function stockLinesOf(
  db: DbOrTx,
  orderId: number,
): Promise<{ skuId: number; quantity: number }[]> {
  return db
    .select({ skuId: orderItems.skuId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.skuId));
}

/**
 * Units of each product this buyer has already committed to, for a `lifetime`
 * purchase limit. Cancelled orders do not count — a shopper who abandoned a
 * checkout has not used up their allowance.
 */
export async function purchasedQuantity(
  db: DbOrTx,
  args: { userId: number; productIds: readonly number[] },
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (args.productIds.length === 0) return out;
  const rows = await db
    .select({
      productId: orderItems.productId,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, args.userId),
        ne(orders.status, 'cancelled'),
        inArray(orderItems.productId, [...new Set(args.productIds)]),
      ),
    )
    .groupBy(orderItems.productId);
  for (const row of rows) out.set(row.productId, Number(row.quantity));
  return out;
}

/**
 * The storefront's tabs are not `orders.status` values — 待收货 covers
 * `shipped`, 已完成 covers `received` *and* `completed` — so the mapping lives
 * here, once, and the list and the badges can never disagree about what 待发货
 * means.
 */
export function tabFilter(tab: OrderListTab): SQL | undefined {
  switch (tab) {
    case 'unpaid':
      return eq(orders.status, 'pending_payment');
    case 'unshipped':
      return eq(orders.status, 'paid');
    case 'shipping':
      return and(eq(orders.status, 'paid'), eq(orders.fulfillmentStatus, 'partially_fulfilled'));
    case 'unreceived':
      return eq(orders.status, 'shipped');
    case 'finished':
      return inArray(orders.status, ['received', 'completed']);
    case 'cancelled':
      return eq(orders.status, 'cancelled');
    case 'refunding':
      return ne(orders.refundStatus, 'none');
    default:
      return undefined;
  }
}

export interface OrderListFilter {
  userId: number;
  where?: SQL | undefined;
  keyword?: string | undefined;
  sortBy?: 'createdAt' | 'payableAmount' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  offset: number;
  limit: number;
}

export async function listOrders(
  db: DbOrTx,
  filter: OrderListFilter,
): Promise<{ rows: OrderRow[]; total: number }> {
  const keyword = filter.keyword?.trim();
  const where = allOf(
    eq(orders.userId, filter.userId),
    liveForUser(),
    filter.where,
    keyword
      ? or(
          sql`${orders.orderNo} like ${`%${keyword}%`}`,
          sql`exists (select 1 from order_items oi where oi.order_id = ${orders.id} and oi.snapshot->>'productName' ilike ${`%${keyword}%`})`,
        )
      : undefined,
  );

  const column = filter.sortBy === 'payableAmount' ? orders.payableAmount : orders.createdAt;
  const direction = filter.sortOrder === 'asc' ? asc : desc;

  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(direction(column), desc(orders.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const counted = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  return { rows, total: Number(counted[0]?.total ?? 0) };
}

/** One grouped query behind all seven badges, rather than seven `count(*)`s. */
export async function countByStatus(
  db: DbOrTx,
  userId: number,
): Promise<{ status: OrderStatus; fulfillmentStatus: string; refunding: boolean; n: number }[]> {
  const rows = await db
    .select({
      status: orders.status,
      fulfillmentStatus: orders.fulfillmentStatus,
      refunding: sql<boolean>`${orders.refundStatus} <> 'none'`,
      n: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), liveForUser()))
    .groupBy(orders.status, orders.fulfillmentStatus, sql`${orders.refundStatus} <> 'none'`);
  return rows.map((row) => ({ ...row, n: Number(row.n) }));
}

/**
 * Orders whose payment window has closed. The partial index
 * `orders_pay_expires_idx (pay_expires_at) WHERE status = 'pending_payment'`
 * exists for exactly this query.
 */
export async function listExpiredUnpaid(
  db: DbOrTx,
  args: { now: Date; limit: number },
): Promise<number[]> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending_payment'),
        lte(orders.payExpiresAt, args.now),
        isNull(orders.deletedAt),
      ),
    )
    .orderBy(asc(orders.payExpiresAt))
    .limit(args.limit);
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// cart lines
// ---------------------------------------------------------------------------

/**
 * The two `cart_items` statements checkout owns.
 *
 * They live here, in the order domain, rather than behind `cart/index.ts`, for
 * one reason: the dependency between the two domains has to point one way, and
 * it points **cart -> order** (the cart reads live catalogue data through
 * `order/catalog.port.ts`, and 再次购买 reads an order). Letting checkout call
 * back into `cart/index.ts` would close the loop and make the two module
 * graphs circular. B1 owns both domains, a `*.repo.ts` is the one kind of file
 * allowed to import `@shop/db/schema/*`, and these are two statements — so the
 * seam costs less than the cycle would. Recorded in `docs/rewrite/status/b1.md`.
 */
export interface CartLine {
  cartItemId: number;
  skuId: number;
  quantity: number;
}

/**
 * The rows a checkout is built from. An empty `cartItemIds` means "everything
 * the shopper has ticked", which is what the 结算 button sends.
 */
export async function selectCartLines(
  db: DbOrTx,
  args: { userId: number; cartItemIds: readonly number[] },
): Promise<CartLine[]> {
  return db
    .select({
      cartItemId: cartItems.id,
      skuId: cartItems.skuId,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .where(
      and(
        eq(cartItems.userId, args.userId),
        args.cartItemIds.length > 0
          ? inArray(cartItems.id, [...new Set(args.cartItemIds)])
          : eq(cartItems.isSelected, true),
      ),
    )
    .orderBy(asc(cartItems.id));
}

/** Empties the rows an order consumed, inside that order's transaction. */
export async function deleteCartLines(
  tx: Tx,
  args: { userId: number; cartItemIds: readonly number[] },
): Promise<number> {
  if (args.cartItemIds.length === 0) return 0;
  const { affected } = await conditionalDelete(
    tx,
    cartItems,
    and(eq(cartItems.userId, args.userId), inArray(cartItems.id, [...new Set(args.cartItemIds)])),
  );
  return affected;
}

// ---------------------------------------------------------------------------
// addresses (stream E1's table; read-only here — see docs/rewrite/status/b1.md)
// ---------------------------------------------------------------------------

export async function findAddress(
  db: DbOrTx,
  args: { id: number; userId: number },
): Promise<AddressRow | null> {
  const rows = await db
    .select()
    .from(userAddresses)
    .where(
      and(
        eq(userAddresses.id, args.id),
        eq(userAddresses.userId, args.userId),
        isNull(userAddresses.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function findDefaultAddress(db: DbOrTx, userId: number): Promise<AddressRow | null> {
  const rows = await db
    .select()
    .from(userAddresses)
    .where(
      and(
        eq(userAddresses.userId, userId),
        eq(userAddresses.isDefault, true),
        isNull(userAddresses.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

export async function insertOrder(tx: Tx, values: NewOrderValues): Promise<OrderRow> {
  const rows = await tx.insert(orders).values(values).returning();
  return rows[0]!;
}

export async function insertOrderItems(
  tx: Tx,
  values: readonly NewOrderItemValues[],
): Promise<OrderItemRow[]> {
  if (values.length === 0) return [];
  return tx
    .insert(orderItems)
    .values([...values])
    .returning();
}

/**
 * The state machine's single statement.
 *
 * `from` is a list, and it is in the WHERE — that is the whole safety
 * property. A caller that read the status first and passed what it saw would
 * be writing a read-then-write with extra steps.
 */
export async function transitionStatus(
  tx: Tx,
  args: {
    orderId: number;
    from: readonly OrderStatus[];
    to: OrderStatus;
    set: Record<string, unknown>;
  },
): Promise<ConditionalUpdateResult> {
  return conditionalUpdate(tx, orders, {
    where: and(eq(orders.id, args.orderId), inArray(orders.status, [...args.from])),
    set: { ...args.set, updatedAt: sql`now()` },
  });
}

export type StatusLogValues = typeof orderStatusLogs.$inferInsert;

export async function insertStatusLog(tx: Tx, values: StatusLogValues): Promise<void> {
  await tx.insert(orderStatusLogs).values(values);
}

export async function countStatusLogs(
  db: DbOrTx,
  args: { orderId: number; changeType: StatusLogValues['changeType'] },
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderStatusLogs)
    .where(
      and(
        eq(orderStatusLogs.orderId, args.orderId),
        eq(orderStatusLogs.changeType, args.changeType),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------

/**
 * "Second submit returns the first order", built on a UNIQUE index.
 *
 * Legacy guarded order creation with `CacheService::lock('orderCreate…')`: a
 * Redis key, never tested, gone after a restart, and with no relationship to
 * the transaction it was supposed to protect (risk matrix §2). The fix in the
 * brief is "an idempotency key with a UNIQUE column".
 *
 * `orders` has no such column yet — **CR-1-b1** asks for
 * `orders.idempotency_key` plus a partial unique index — so until it lands the
 * claim is a row in the generic `effects` ledger, whose
 * `UNIQUE (scope, scope_id, event_type)` is exactly the constraint needed:
 *
 *  - `scope` is `order-idem`, a scope with no registered handler;
 *  - `status` is written as `done` with `dispatched_at` set, so the dispatcher
 *    (which claims `status = 'pending' AND next_run_at <= now()`) never sees it
 *    and never tries to deliver it;
 *  - `scope_id` is `sha256(userId:key)`, 64 hex characters, because the column
 *    is `varchar(64)` and a 64-character key plus a user id does not fit.
 *
 * When CR-1 lands, these three functions change and nothing else does.
 */
const IDEMPOTENCY_SCOPE = 'order-idem';
const IDEMPOTENCY_EVENT = 'create';

function idempotencyId(userId: number, key: string): string {
  return createHash('sha256').update(`${userId}:${key}`).digest('hex');
}

export interface IdempotencyClaim {
  /** `false` means another submit with this key got there first. */
  won: boolean;
}

/**
 * Must be the **first** statement of the creating transaction, so a loser has
 * written nothing it needs to undo.
 *
 * `ON CONFLICT DO NOTHING` waits for a concurrent inserter to settle: if that
 * transaction committed we lose and its order id is readable; if it rolled
 * back the conflicting tuple is dead and our insert goes through.
 */
export async function claimIdempotencyKey(
  tx: Tx,
  args: { userId: number; key: string; now: Date },
): Promise<IdempotencyClaim> {
  const rows = await tx
    .insert(effects)
    .values({
      scope: IDEMPOTENCY_SCOPE,
      scopeId: idempotencyId(args.userId, args.key),
      eventType: IDEMPOTENCY_EVENT,
      payload: { userId: args.userId },
      status: 'done',
      nextRunAt: args.now,
      dispatchedAt: args.now,
    })
    .onConflictDoNothing()
    .returning({ id: effects.id });
  return { won: rows.length > 0 };
}

/** Second statement: stamp the order the claim produced onto the claim row. */
export async function recordIdempotentOrder(
  tx: Tx,
  args: { userId: number; key: string; orderId: number },
): Promise<void> {
  await conditionalUpdate(tx, effects, {
    where: and(
      eq(effects.scope, IDEMPOTENCY_SCOPE),
      eq(effects.scopeId, idempotencyId(args.userId, args.key)),
      eq(effects.eventType, IDEMPOTENCY_EVENT),
    ),
    set: { payload: { userId: args.userId, orderId: args.orderId } },
  });
}

/** What the loser of the race reads. `null` only if the winner is still mid-flight. */
export async function findIdempotentOrderId(
  db: DbOrTx,
  args: { userId: number; key: string },
): Promise<number | null> {
  const rows = await db
    .select({ payload: effects.payload })
    .from(effects)
    .where(
      and(
        eq(effects.scope, IDEMPOTENCY_SCOPE),
        eq(effects.scopeId, idempotencyId(args.userId, args.key)),
        eq(effects.eventType, IDEMPOTENCY_EVENT),
      ),
    )
    .limit(1);
  const payload = rows[0]?.payload as { orderId?: number } | undefined;
  return typeof payload?.orderId === 'number' ? payload.orderId : null;
}

/** Only the tests look at this. */
export async function countIdempotencyClaims(db: DbOrTx): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(effects)
    .where(and(eq(effects.scope, IDEMPOTENCY_SCOPE), gt(effects.id, 0)));
  return Number(rows[0]?.n ?? 0);
}

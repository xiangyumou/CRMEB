/**
 * The tables that must come out of the migration **empty**, and the assertion
 * that proves it.
 *
 * PLAN §3 and SCHEMA.md §4 decided that no order-shaped data crosses: the seven
 * production test orders are discarded, and with them the carts, the payment
 * attempts, the refunds, the effects ledger and the exception payments. That is
 * not a nice-to-have. Half-migrated orders are the single most expensive thing
 * a cutover can produce — an order whose payment attempt did not come across
 * looks refundable, and an order whose stock reservation did not come across
 * oversells.
 *
 * So the runner asserts emptiness after the load rather than trusting that no
 * mapper wrote there. A group that gains a target in this list fails the run.
 *
 * `user_coupons` is the subtle one. It **is** migrated — the wallet crosses —
 * but a user coupon that was spent on an order refers to an order that does
 * not exist any more, so `source_order_id` must be NULL on every migrated row.
 * That is asserted as a column predicate, not as an empty table.
 */

export interface EmptyTableCheck {
  table: string;
  reason: string;
}

/** Tables no group may write. The order is the order they are reported in. */
export const MUST_STAY_EMPTY: readonly EmptyTableCheck[] = [
  { table: 'orders', reason: '订单不迁移（PLAN §3）' },
  { table: 'order_items', reason: '订单不迁移，明细随之作废' },
  { table: 'order_status_logs', reason: '订单不迁移' },
  { table: 'order_invoices', reason: '订单不迁移' },
  { table: 'shipments', reason: '订单不迁移' },
  { table: 'shipment_items', reason: '订单不迁移' },
  { table: 'cart_items', reason: '购物车不迁移：价格与库存都会在切换时重新计算' },
  { table: 'payment_attempts', reason: '支付不迁移：没有订单可以支付' },
  { table: 'payment_callbacks', reason: '支付不迁移' },
  { table: 'payment_exceptions', reason: '支付不迁移' },
  { table: 'refunds', reason: '退款不迁移：没有订单可以退' },
  { table: 'refund_items', reason: '退款不迁移' },
  { table: 'refund_logs', reason: '退款不迁移' },
  { table: 'effects', reason: '副作用账本属于新系统，旧账本不重放' },
  { table: 'capital_flows', reason: '资金流水不迁移（SCHEMA §4.1）' },
  { table: 'groupbuy_groups', reason: '生产库没有拼团团（SCHEMA §4.1）' },
  { table: 'groupbuy_members', reason: '生产库没有拼团团' },
  { table: 'presale_orders', reason: '预售订单随订单一起作废' },
  { table: 'presale_stock_ledger', reason: '预售占位随订单一起作废' },
  { table: 'product_events', reason: '浏览/统计流水不迁移（SCHEMA §4.1）' },
  { table: 'user_visits', reason: '浏览/统计流水不迁移' },
  { table: 'search_logs', reason: '浏览/统计流水不迁移' },
];

export interface NonEmptyTarget {
  table: string;
  rows: number;
  reason: string;
}

export class NotMigratedTablesError extends Error {
  readonly offenders: readonly NonEmptyTarget[];

  constructor(offenders: readonly NonEmptyTarget[]) {
    super(
      `以下表本次迁移必须保持为空，但已经有数据：\n` +
        offenders.map((o) => `  ${o.table}: ${String(o.rows)} 行（${o.reason}）`).join('\n') +
        `\n请检查是哪个 group 写入了它们。`,
    );
    this.name = 'NotMigratedTablesError';
    this.offenders = offenders;
  }
}

/** A thing that can count rows: the runner's pg client, or a fake in a test. */
export interface RowCounter {
  countRows(table: string): Promise<number>;
  countWhere(table: string, predicate: string): Promise<number>;
}

/**
 * Checks every table in `MUST_STAY_EMPTY`, plus the one column predicate:
 * a migrated `user_coupons` row may not point at an order.
 *
 * Returns the offenders rather than throwing, so `verify` can report all of
 * them at once; `assertNotMigrated` is the throwing wrapper the runner uses.
 */
export async function findNotMigratedOffenders(counter: RowCounter): Promise<NonEmptyTarget[]> {
  const offenders: NonEmptyTarget[] = [];
  for (const check of MUST_STAY_EMPTY) {
    const rows = await counter.countRows(check.table);
    if (rows > 0) offenders.push({ table: check.table, rows, reason: check.reason });
  }
  const orphanedCoupons = await counter.countWhere('user_coupons', 'source_order_id is not null');
  if (orphanedCoupons > 0) {
    offenders.push({
      table: 'user_coupons.source_order_id',
      rows: orphanedCoupons,
      reason: '订单不迁移，所以已迁移的优惠券不能指向订单',
    });
  }
  return offenders;
}

export async function assertNotMigrated(counter: RowCounter): Promise<void> {
  const offenders = await findNotMigratedOffenders(counter);
  if (offenders.length > 0) throw new NotMigratedTablesError(offenders);
}

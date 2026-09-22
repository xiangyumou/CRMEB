import { describe, expect, it } from 'vitest';

import {
  MUST_STAY_EMPTY,
  NotMigratedTablesError,
  assertNotMigrated,
  findNotMigratedOffenders,
  type RowCounter,
} from './not-migrated';

function counter(
  rows: Readonly<Record<string, number>>,
  predicates: Readonly<Record<string, number>> = {},
): RowCounter {
  return {
    countRows: (table) => Promise.resolve(rows[table] ?? 0),
    countWhere: (table, predicate) => Promise.resolve(predicates[`${table}:${predicate}`] ?? 0),
  };
}

describe('findNotMigratedOffenders', () => {
  it('is quiet when every table that must stay empty is empty', async () => {
    expect(await findNotMigratedOffenders(counter({}))).toEqual([]);
  });

  it('names the table, the row count and why it should have been empty', async () => {
    const offenders = await findNotMigratedOffenders(counter({ orders: 7 }));
    expect(offenders).toEqual([{ table: 'orders', rows: 7, reason: '订单不迁移（PLAN §3）' }]);
  });

  it('reports every offender at once rather than stopping at the first', async () => {
    const offenders = await findNotMigratedOffenders(
      counter({ orders: 7, cart_items: 3, effects: 1 }),
    );
    expect(offenders.map((o) => o.table)).toEqual(['orders', 'cart_items', 'effects']);
  });

  it('catches a migrated coupon that still points at an order', async () => {
    // The wallet *is* migrated; the order it was spent on is not. A dangling
    // source_order_id would make a used coupon look refundable.
    const offenders = await findNotMigratedOffenders(
      counter({}, { 'user_coupons:source_order_id is not null': 2 }),
    );
    expect(offenders).toEqual([
      {
        table: 'user_coupons.source_order_id',
        rows: 2,
        reason: '订单不迁移，所以已迁移的优惠券不能指向订单',
      },
    ]);
  });

  it('covers the whole order, cart, payment and refund family', async () => {
    const tables = MUST_STAY_EMPTY.map((c) => c.table);
    for (const required of [
      'orders',
      'order_items',
      'cart_items',
      'payment_attempts',
      'payment_exceptions',
      'refunds',
      'refund_items',
      'effects',
    ]) {
      expect(tables).toContain(required);
    }
  });
});

describe('assertNotMigrated', () => {
  it('throws with every offender in the message', async () => {
    await expect(assertNotMigrated(counter({ orders: 7, refunds: 1 }))).rejects.toThrow(
      NotMigratedTablesError,
    );
    await expect(assertNotMigrated(counter({ orders: 7 }))).rejects.toThrow(/orders: 7 行/);
  });

  it('returns quietly on a clean database', async () => {
    await expect(assertNotMigrated(counter({}))).resolves.toBeUndefined();
  });
});

import type { Tx } from '@shop/db';

import type { StockLine, StockPort, StockReleaseOptions } from '../order/ports';
import * as repo from './catalog.repo';

/**
 * The catalog's implementation of `StockPort`.
 *
 * Stock leaves the shelf when the order is *placed*, not when it is paid. That
 * is the whole of risk-matrix §1's second row: the last unit must be
 * unsellable the instant somebody commits to buying it, and the only way to
 * make that true under concurrency is one statement whose WHERE clause carries
 * the precondition —
 *
 *     UPDATE product_skus SET stock = stock - $n WHERE id = $1 AND stock >= $n
 *
 * Two shoppers both run it; PostgreSQL serialises them on the row; the loser
 * changes no rows and is told 库存不足. Legacy read the row, compared in PHP and
 * then wrote (`StoreProductAttrValueServices::decProductAttrStock`), which is
 * the defect the brief names under "Fix, don't port".
 *
 * `sales` is a separate column moved only by `commit`, because a placed order
 * is not a sale. `release` therefore takes `{ committed }` to say whether it
 * has to come back down again (CR-1-a).
 *
 * Nothing here touches the product-level denormalised counters directly; each
 * method rolls the affected products up afterwards in the same transaction, so
 * `products.stock` can never disagree with the sum of its SKUs for longer than
 * one statement.
 */

/** Distinct product ids behind a set of lines, for the rollup. */
async function rollupFor(tx: Tx, lines: readonly StockLine[]): Promise<void> {
  const skus = await repo.skusByIds(
    tx,
    lines.map((line) => line.skuId),
  );
  const productIds = new Set([...skus.values()].map((sku) => sku.productId));
  for (const productId of productIds) {
    await repo.rollupProduct(tx, productId);
  }
}

/**
 * STOCK-001. A line of zero units would pass `stock >= 0` and report success
 * against no movement at all; a negative one would *add* stock and call it a
 * sale; a fractional one would leave a fractional shelf. The contracts already
 * require an integer `quantity >= 1`, so reaching here with anything else is a
 * programmer error — and one that must stop the caller's transaction rather
 * than quietly mint inventory. Legacy's helper accepted any number.
 */
function assertPositive(lines: readonly StockLine[]): void {
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error(
        `stock line for sku ${line.skuId} must be a positive integer, got ${line.quantity}`,
      );
    }
  }
}

/** Collapses duplicate lines: two cart rows of the same SKU are one decrement of two. */
function mergeLines(lines: readonly StockLine[]): StockLine[] {
  assertPositive(lines);
  const byId = new Map<number, number>();
  for (const line of lines) {
    byId.set(line.skuId, (byId.get(line.skuId) ?? 0) + line.quantity);
  }
  return [...byId].map(([skuId, quantity]) => ({ skuId, quantity }));
}

export const catalogStockPort: StockPort = {
  /**
   * Take stock off the shelf.
   *
   * Returns the lines that could not be satisfied rather than throwing, because
   * the caller wants to tell the shopper *which* item ran out, and because a
   * partial success must still roll back — B1 aborts its transaction on a
   * non-empty result and every decrement made here goes with it.
   *
   * Lines are processed in ascending SKU id. Two orders containing the same two
   * SKUs in opposite cart order would otherwise be able to deadlock on each
   * other; a fixed order makes that impossible.
   */
  async reserve(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<StockLine[]> {
    void orderId;
    const merged = mergeLines(lines).sort((a, b) => a.skuId - b.skuId);
    const failed: StockLine[] = [];

    for (const line of merged) {
      const { won } = await repo.reserveSkuStock(tx, line);
      if (!won) failed.push(line);
    }
    if (failed.length > 0) return failed;

    await rollupFor(tx, merged);
    return [];
  },

  /**
   * Turn a reservation into a sale.
   *
   * Guarded by the ledger key `catalog.stock.commit`: the order-paid effect is
   * delivered at least once, and a replay must not add the quantity to `sales`
   * twice.
   */
  async commit(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<void> {
    const first = await repo.claimStockOperation(tx, {
      scope: 'order',
      scopeId: orderId,
      eventType: 'catalog.stock.commit',
    });
    if (!first) return;

    const merged = mergeLines(lines).sort((a, b) => a.skuId - b.skuId);
    for (const line of merged) {
      await repo.commitSkuSale(tx, line);
    }
    await rollupFor(tx, merged);
  },

  /**
   * Hand stock back to the shelf.
   *
   * Two callers with two different needs, and the difference is `sales`:
   *
   *  - **cancel / payment timeout** (`options` absent). `commit` never ran, so
   *    `sales` was never incremented and touching it here is what would create
   *    the drift, not what would fix it. Idempotent per *order*: an order is
   *    cancelled once.
   *  - **refund** (`committed: true`). `commit` did run, so stock and `sales`
   *    move back in the same statement, `sales = greatest(0, sales - n)`.
   *    Idempotent per *refund*, because an order is refunded line by line and
   *    a per-order key would swallow the second partial refund and leave that
   *    stock off the shelf forever. `refundId` is what makes the key distinct;
   *    without one the per-order key is used, which is right for cancel and
   *    would be wrong for a partial refund — so C always passes it.
   */
  async release(
    tx: Tx,
    orderId: number,
    lines: readonly StockLine[],
    options?: StockReleaseOptions,
  ): Promise<void> {
    const first = await repo.claimStockOperation(
      tx,
      options?.refundId !== undefined
        ? { scope: 'refund', scopeId: options.refundId, eventType: 'catalog.stock.release' }
        : { scope: 'order', scopeId: orderId, eventType: 'catalog.stock.release' },
    );
    if (!first) return;

    const merged = mergeLines(lines).sort((a, b) => a.skuId - b.skuId);
    for (const line of merged) {
      if (options?.committed === true) await repo.releaseSoldSkuStock(tx, line);
      else await repo.releaseSkuStock(tx, line);
    }
    await rollupFor(tx, merged);
  },
};

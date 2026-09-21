import type { DbOrTx, Tx } from '@shop/db';
import { productCategoriesMap, productSkus, products } from '@shop/db/schema/catalog';
import { eq, inArray, sql } from 'drizzle-orm';
import type { StockLine, StockPort } from './ports';
import {
  setCatalogFallbacks,
  type CatalogPort,
  type CustomFormField,
  type FreightMode,
  type ProductKind,
  type PurchaseLimitMode,
  type SkuForSale,
} from './catalog.port';

/**
 * B1's stand-in for stream A.
 *
 * Two things live here and both belong to `catalog` the moment A lands: the
 * read model checkout needs (`getSkusForSale`) and the `StockPort`.
 *
 * The stock statements are the point. Legacy's `incStockDecSales` read the row,
 * did arithmetic in PHP and wrote it back, which is how the last unit of a
 * popular SKU got sold twice. Here each line is **one** statement whose WHERE
 * carries the precondition, and the decision is the affected row count:
 *
 *     UPDATE product_skus SET stock = stock - $n WHERE id = $1 AND stock >= $n
 *
 * `product_skus_stock_non_negative` is the backstop, not the mechanism.
 */

interface SkuRow {
  skuId: number;
  productId: number;
  productName: string;
  productImageUrl: string;
  productKind: ProductKind;
  productStatus: 'draft' | 'on_shelf' | 'off_shelf';
  productDeleted: boolean;
  skuCode: string;
  specText: string;
  specValues: Record<string, string>;
  skuImageUrl: string | null;
  unitName: string | null;
  barCode: string | null;
  unitPrice: string;
  originalUnitPrice: string | null;
  costUnitPrice: string | null;
  stock: number;
  isVisible: boolean;
  weight: string | null;
  volume: string | null;
  freightMode: FreightMode;
  fixedFreight: string | null;
  shippingTemplateId: number | null;
  purchaseLimitMode: PurchaseLimitMode;
  purchaseLimitQuantity: number | null;
  minPurchaseQuantity: number;
  customForm: CustomFormField[] | null;
}

async function selectSkus(db: DbOrTx, skuIds: readonly number[]): Promise<SkuRow[]> {
  if (skuIds.length === 0) return [];
  const rows = await db
    .select({
      skuId: productSkus.id,
      productId: products.id,
      productName: products.name,
      productImageUrl: products.imageUrl,
      productKind: products.kind,
      productStatus: products.status,
      productDeleted: sql<boolean>`${products.deletedAt} is not null`,
      skuCode: productSkus.skuCode,
      specText: productSkus.specText,
      specValues: productSkus.specValues,
      skuImageUrl: productSkus.imageUrl,
      unitName: products.unitName,
      barCode: productSkus.barCode,
      unitPrice: productSkus.price,
      originalUnitPrice: productSkus.originalPrice,
      costUnitPrice: productSkus.cost,
      stock: productSkus.stock,
      isVisible: productSkus.isVisible,
      weight: productSkus.weight,
      volume: productSkus.volume,
      freightMode: products.freightMode,
      fixedFreight: products.fixedFreight,
      shippingTemplateId: products.shippingTemplateId,
      purchaseLimitMode: products.purchaseLimitMode,
      purchaseLimitQuantity: products.purchaseLimitQuantity,
      minPurchaseQuantity: products.minPurchaseQuantity,
      customForm: products.customForm,
    })
    .from(productSkus)
    .innerJoin(products, eq(products.id, productSkus.productId))
    .where(inArray(productSkus.id, [...new Set(skuIds)]));
  return rows as SkuRow[];
}

async function categoryIdsOf(
  db: DbOrTx,
  productIds: readonly number[],
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (productIds.length === 0) return out;
  const rows = await db
    .select({
      productId: productCategoriesMap.productId,
      categoryId: productCategoriesMap.categoryId,
    })
    .from(productCategoriesMap)
    .where(inArray(productCategoriesMap.productId, [...new Set(productIds)]));
  for (const row of rows) {
    const list = out.get(row.productId);
    if (list) list.push(row.categoryId);
    else out.set(row.productId, [row.categoryId]);
  }
  return out;
}

export const repoCatalogPort: CatalogPort = {
  async getSkusForSale(db, skuIds) {
    const rows = await selectSkus(db, skuIds);
    const categories = await categoryIdsOf(
      db,
      rows.map((r) => r.productId),
    );
    const out = new Map<number, SkuForSale>();
    for (const row of rows) {
      out.set(row.skuId, {
        skuId: row.skuId,
        productId: row.productId,
        productName: row.productName,
        productImageUrl: row.productImageUrl,
        productKind: row.productKind,
        onSale: !row.productDeleted && row.productStatus === 'on_shelf' && row.isVisible,
        deleted: row.productDeleted,
        skuCode: row.skuCode,
        specText: row.specText,
        specValues: row.specValues,
        skuImageUrl: row.skuImageUrl,
        unitName: row.unitName,
        barCode: row.barCode,
        unitPrice: row.unitPrice,
        originalUnitPrice: row.originalUnitPrice,
        costUnitPrice: row.costUnitPrice,
        stock: row.stock,
        weight: row.weight,
        volume: row.volume,
        freightMode: row.freightMode,
        fixedFreight: row.fixedFreight,
        shippingTemplateId: row.shippingTemplateId,
        purchaseLimitMode: row.purchaseLimitMode,
        purchaseLimitQuantity: row.purchaseLimitQuantity,
        minPurchaseQuantity: row.minPurchaseQuantity,
        categoryIds: categories.get(row.productId) ?? [],
        customForm: row.customForm,
      });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// StockPort
// ---------------------------------------------------------------------------

/**
 * STOCK-001. A line of zero units would pass `stock >= 0` and report success
 * against no movement at all; a negative one would *add* stock and call it a
 * sale. The contracts already require `quantity >= 1`, so reaching here with
 * anything else is a programmer error — and one that must stop the caller's
 * transaction rather than quietly mint inventory.
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

/** `UPDATE … SET stock = stock - $n WHERE id = $1 AND stock >= $n`; returns rows changed. */
async function takeStock(tx: Tx, line: StockLine): Promise<number> {
  const result = await tx.execute(sql`
    update product_skus
       set stock = stock - ${line.quantity}, updated_at = now()
     where id = ${line.skuId} and stock >= ${line.quantity}
  `);
  return rowCount(result);
}

async function giveStockBack(tx: Tx, line: StockLine): Promise<void> {
  await tx.execute(sql`
    update product_skus
       set stock = stock + ${line.quantity}, updated_at = now()
     where id = ${line.skuId}
  `);
}

/** The denormalised product totals follow the SKU, in the same shape of statement. */
async function moveProductStock(tx: Tx, skuId: number, delta: number): Promise<void> {
  await tx.execute(sql`
    update products
       set stock = greatest(0, stock + ${delta}), updated_at = now()
     where id = (select product_id from product_skus where id = ${skuId})
  `);
}

async function moveSales(tx: Tx, line: StockLine): Promise<void> {
  await tx.execute(sql`
    update product_skus
       set sales = sales + ${line.quantity}, updated_at = now()
     where id = ${line.skuId}
  `);
  await tx.execute(sql`
    update products
       set sales = sales + ${line.quantity}, updated_at = now()
     where id = (select product_id from product_skus where id = ${line.skuId})
  `);
}

function rowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const count = (result as { rowCount?: number | null } | null)?.rowCount;
  return typeof count === 'number' ? count : 0;
}

/**
 * `reserve` takes the units out of `stock` immediately — an unpaid order holds
 * real inventory, which is what the auto-cancel job exists to give back.
 * `commit` then only moves the `sales` counter, so a paid order never
 * double-decrements.
 *
 * All-or-nothing across lines: the first line that comes up short stops the
 * loop and everything already taken is handed straight back, so a caller that
 * chooses *not* to abort its transaction still leaves no stock behind. ORDER-008.
 */
export const repoStockPort: StockPort = {
  async reserve(tx, _orderId, lines) {
    assertPositive(lines);
    const taken: StockLine[] = [];
    for (const line of lines) {
      if ((await takeStock(tx, line)) === 0) {
        for (const done of taken) {
          await giveStockBack(tx, done);
          await moveProductStock(tx, done.skuId, done.quantity);
        }
        return [line];
      }
      taken.push(line);
      await moveProductStock(tx, line.skuId, -line.quantity);
    }
    return [];
  },

  async release(tx, _orderId, lines) {
    assertPositive(lines);
    for (const line of lines) {
      await giveStockBack(tx, line);
      await moveProductStock(tx, line.skuId, line.quantity);
    }
  },

  async commit(tx, _orderId, lines) {
    assertPositive(lines);
    for (const line of lines) await moveSales(tx, line);
  },
};

/**
 * Idempotency note for stream A: these three are **not** idempotent per
 * `orderId` on their own — they carry no reservation ledger. B1's callers make
 * them so by holding the order row and doing the release inside the same
 * conditional `pending_payment -> cancelled` transition, which exactly one
 * caller can win. A's real implementation should key on the order so the
 * effects ledger can retry `release` safely.
 */
setCatalogFallbacks(repoCatalogPort, repoStockPort);

/** Only the tests need this; everything else goes through the port. */
export async function stockAndSalesOf(
  db: DbOrTx,
  skuId: number,
): Promise<{ stock: number; sales: number }> {
  const rows = await db
    .select({ stock: productSkus.stock, sales: productSkus.sales })
    .from(productSkus)
    .where(eq(productSkus.id, skuId))
    .limit(1);
  return rows[0] ?? { stock: 0, sales: 0 };
}

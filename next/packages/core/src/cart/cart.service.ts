import type {
  CartAddBody,
  CartCount,
  CartItem,
  CartList,
  CartListQuery,
  CartMutationResult,
  CartRebuyBody,
  CartRebuyResult,
  CartRemoveBody,
  CartSelectionBody,
  CartUpdateBody,
} from '@shop/contracts/cart/schemas';
import type { DbOrTx } from '@shop/db';
import { requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId } from '../kernel/ids';
import { Money } from '../kernel/money';
import { rebuyLines, resolveCatalogPort, type SkuForSale } from '../order';
import * as repo from './cart.repo';
import {
  MAX_CART_ROWS,
  capFor,
  isAvailable,
  refuseQuantity,
  stateOf,
  type QuantityRefusal,
} from './cart.rules';

/**
 * The cart.
 *
 * Two decisions shape every function here.
 *
 * **Nothing about a product is stored on the cart row.** The row is
 * `(user, sku, quantity, isSelected)`; the name, the picture, the price and
 * the stock are read live through the catalogue port every time the cart is
 * listed. Legacy copied `cart_info` onto the row as a JSON blob and then had a
 * scheduled task trying to keep it in step with the product table, which is
 * how a shopper could be shown — and charged — last month's price.
 *
 * **An unsellable row is shown, not deleted.** `stateOf` says why it cannot be
 * checked out, the storefront greys it out, and 清空失效商品 removes them when
 * the shopper asks.
 */

interface EnrichedRow {
  row: repo.CartRow;
  sku: SkuForSale | undefined;
  state: ReturnType<typeof stateOf>;
  available: boolean;
  unitPrice: Money;
  subtotal: Money;
}

async function loadCart(ctx: Ctx, db: DbOrTx, userId: number): Promise<EnrichedRow[]> {
  const rows = await repo.listByUser(db, { userId, limit: MAX_CART_ROWS });
  const skus = await resolveCatalogPort().getSkusForSale(
    db,
    rows.map((row) => row.skuId),
  );
  return rows.map((row) => {
    const sku = skus.get(row.skuId);
    const state = stateOf(sku, row.quantity);
    const unitPrice = sku ? Money.parse(sku.unitPrice) : Money.ZERO;
    return {
      row,
      sku,
      state,
      available: isAvailable(state),
      unitPrice,
      subtotal: unitPrice.mul(row.quantity),
    };
  });
}

function toCartItem(entry: EnrichedRow): CartItem {
  const sku = entry.sku;
  return {
    id: toId(entry.row.id),
    productId: toId(entry.row.productId),
    skuId: toId(entry.row.skuId),
    quantity: entry.row.quantity,
    isSelected: entry.row.isSelected,
    available: entry.available,
    state: entry.state,
    // A deleted variant has no live data left; the row still has to render so
    // the shopper can remove it.
    productName: sku?.productName ?? '商品已下架',
    productImageUrl: sku?.productImageUrl ?? '',
    productKind: sku?.productKind ?? 'physical',
    skuImageUrl: sku?.skuImageUrl ?? null,
    specText: sku?.specText ?? '',
    unitName: sku?.unitName ?? null,
    unitPrice: entry.unitPrice.toString(),
    originalUnitPrice: sku?.originalUnitPrice ?? null,
    subtotal: entry.subtotal.toString(),
    stock: sku?.stock ?? 0,
    createdAt: entry.row.createdAt.toISOString(),
  };
}

function countOf(entries: readonly EnrichedRow[]): CartCount {
  const availableCount = entries.filter((entry) => entry.available).length;
  return {
    items: entries.length,
    quantity: entries.reduce((sum, entry) => sum + entry.row.quantity, 0),
    availableCount,
    unavailableCount: entries.length - availableCount,
  };
}

function listOf(entries: readonly EnrichedRow[], query: CartListQuery): CartList {
  const filtered = entries.filter((entry) =>
    query.filter === 'available'
      ? entry.available
      : query.filter === 'unavailable'
        ? !entry.available
        : true,
  );
  const start = (query.page - 1) * query.pageSize;
  const selected = entries.filter((entry) => entry.available && entry.row.isSelected);

  return {
    items: filtered.slice(start, start + query.pageSize).map(toCartItem),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    availableCount: entries.filter((entry) => entry.available).length,
    unavailableCount: entries.filter((entry) => !entry.available).length,
    // Ticked *and* sellable: an out-of-stock row the shopper ticked last week
    // must not inflate what the 结算 button says.
    selectedQuantity: selected.reduce((sum, entry) => sum + entry.row.quantity, 0),
    selectedTotal: Money.sum(selected.map((entry) => entry.subtotal)).toString(),
  };
}

function refuse(refusal: QuantityRefusal): never {
  throw new DomainError(
    refusal.code,
    refusal.details === undefined ? {} : { details: refusal.details },
  );
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export async function list(ctx: Ctx, query: CartListQuery): Promise<CartList> {
  const userId = requireUserId(ctx);
  return listOf(await loadCart(ctx, ctx.db, userId), query);
}

export async function count(ctx: Ctx): Promise<CartCount> {
  const userId = requireUserId(ctx);
  return countOf(await loadCart(ctx, ctx.db, userId));
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

async function skuOrRefuse(ctx: Ctx, db: DbOrTx, skuId: number): Promise<SkuForSale> {
  const skus = await resolveCatalogPort().getSkusForSale(db, [skuId]);
  const sku = skus.get(skuId);
  if (!sku || sku.deleted || !sku.onSale) throw new DomainError('CART_SKU_NOT_AVAILABLE');
  return sku;
}

/**
 * 加入购物车. Adding is **relative** — two taps of `1` leave `2` — which is
 * what the button means, and it is one `INSERT … ON CONFLICT DO UPDATE`, so two
 * devices tapping at once end at the sum rather than at two rows.
 *
 * The limit check reads the current quantity first, which is a read-then-write
 * and is deliberately only advisory: the hard cap rides along in the same
 * statement as `least(quantity + n, cap)`, so the worst a lost race can do is
 * report success at the cap instead of a refusal.
 */
export async function addItem(ctx: Ctx, body: CartAddBody): Promise<CartMutationResult> {
  const userId = requireUserId(ctx);
  const skuId = fromId(body.skuId);

  const entries = await ctx.withTx(async (tx) => {
    const sku = await skuOrRefuse(ctx, tx, skuId);
    const existing = await repo.findBySku(tx, { userId, skuId });
    const wanted = (existing?.quantity ?? 0) + body.quantity;

    const refusal = refuseQuantity(sku, wanted);
    if (refusal) refuse(refusal);

    await repo.addUnits(tx, {
      userId,
      productId: sku.productId,
      skuId,
      quantity: body.quantity,
      cap: capFor(sku),
    });
    return loadCart(ctx, tx, userId);
  });

  const entry = entries.find((candidate) => candidate.row.skuId === skuId);
  return { item: entry ? toCartItem(entry) : null, cart: countOf(entries) };
}

/** Absolute quantity and/or the tick. `PATCH`, because it is a partial edit. */
export async function updateItem(
  ctx: Ctx,
  params: { id: string },
  body: CartUpdateBody,
): Promise<CartMutationResult> {
  const userId = requireUserId(ctx);
  const id = fromId(params.id);

  const entries = await ctx.withTx(async (tx) => {
    const row = await repo.findForUser(tx, { id, userId });
    if (!row) throw new DomainError('CART_ITEM_NOT_FOUND');

    if (body.quantity !== undefined) {
      const sku = await skuOrRefuse(ctx, tx, row.skuId);
      const refusal = refuseQuantity(sku, body.quantity);
      if (refusal) refuse(refusal);
      const moved = await repo.setQuantity(tx, { id, userId, quantity: body.quantity });
      if (!moved.won) throw new DomainError('CART_ITEM_NOT_FOUND');
    }
    if (body.isSelected !== undefined) {
      await repo.setSelected(tx, { userId, ids: [id], isSelected: body.isSelected });
    }
    return loadCart(ctx, tx, userId);
  });

  const entry = entries.find((candidate) => candidate.row.id === id);
  return { item: entry ? toCartItem(entry) : null, cart: countOf(entries) };
}

export async function removeItem(ctx: Ctx, params: { id: string }): Promise<CartMutationResult> {
  const userId = requireUserId(ctx);
  const id = fromId(params.id);

  const entries = await ctx.withTx(async (tx) => {
    const removed = await repo.remove(tx, { userId, ids: [id] });
    if (removed === 0) throw new DomainError('CART_ITEM_NOT_FOUND');
    return loadCart(ctx, tx, userId);
  });
  return { item: null, cart: countOf(entries) };
}

/** Bulk delete, and 清空失效商品 behind the same route. */
export async function removeItems(
  ctx: Ctx,
  body: CartRemoveBody,
): Promise<{ removed: number; cart: CartCount }> {
  const userId = requireUserId(ctx);

  return ctx.withTx(async (tx) => {
    const ids = body.unavailableOnly
      ? (await loadCart(ctx, tx, userId))
          .filter((entry) => !entry.available)
          .map((entry) => entry.row.id)
      : body.itemIds.map(fromId);
    const removed = await repo.remove(tx, { userId, ids });
    return { removed, cart: countOf(await loadCart(ctx, tx, userId)) };
  });
}

/**
 * Ticking rows.
 *
 * 全选 ticks every **available** row and never a dead one, which would only
 * put it back into the 结算 total the next time the shopper looked. 全不选
 * clears every row, dead ones included — leaving a ticked corpse behind would
 * mean 全不选 did not do what it says.
 */
export async function setSelection(ctx: Ctx, body: CartSelectionBody): Promise<CartList> {
  const userId = requireUserId(ctx);

  const entries = await ctx.withTx(async (tx) => {
    const loaded = await loadCart(ctx, tx, userId);
    const ids = body.all
      ? loaded
          .filter((entry) => (body.isSelected ? entry.available : true))
          .map((entry) => entry.row.id)
      : body.itemIds.map(fromId);
    await repo.setSelected(tx, { userId, ids, isSelected: body.isSelected });
    return loadCart(ctx, tx, userId);
  });

  return listOf(entries, { page: 1, pageSize: 20, filter: 'all' });
}

/**
 * 再次购买.
 *
 * Reports rather than refuses: products go off shelf, and a partial result is
 * the normal case. The lines come from the order domain — the cart may not
 * read `order_items` itself — and each one is put back with the same relative
 * add the 加入购物车 button uses.
 */
export async function rebuy(ctx: Ctx, body: CartRebuyBody): Promise<CartRebuyResult> {
  const userId = requireUserId(ctx);
  const lines = await rebuyLines(ctx, { orderId: fromId(body.orderId), userId });

  return ctx.withTx(async (tx) => {
    const skus = await resolveCatalogPort().getSkusForSale(
      tx,
      lines.map((line) => line.skuId),
    );
    const skipped: string[] = [];
    let added = 0;

    for (const line of lines) {
      const sku = skus.get(line.skuId);
      if (!sku || sku.deleted || !sku.onSale || sku.stock < 1) {
        skipped.push(toId(line.skuId));
        continue;
      }
      const quantity = Math.min(line.quantity, capFor(sku), Math.max(1, sku.stock));
      await repo.addUnits(tx, {
        userId,
        productId: sku.productId,
        skuId: sku.skuId,
        quantity,
        cap: capFor(sku),
      });
      added += 1;
    }

    return { added, skippedSkuIds: skipped, cart: countOf(await loadCart(ctx, tx, userId)) };
  });
}
